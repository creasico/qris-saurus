import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
import type { GatewayAdapter } from "./adapter";
import { pollUntilSettled, type PollOptions } from "./poller";
import type { ApiQrCreateOptions, ApiQrResult, DuitkuConfig, WebhookResult } from "./types";

// statusCode dari Duitku: "00" lunas, "01" pending, "02" dibatalkan
const STATUS_MAP: Record<string, PaymentStatusCode> = {
  "00": "paid",
  "01": "pending",
  "02": "cancelled",
};

const DEFAULT_FETCH_TIMEOUT_MS = 30000; // 30 seconds

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

export class DuitkuAdapter implements GatewayAdapter {
  private baseUrl(sandbox = false): string {
    return sandbox
      ? "https://sandbox.duitku.com/webapi/api/merchant"
      : "https://api-prod.duitku.com/api/merchant";
  }

  private async request<T>(url: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Duitku error [${response.status}]: ${text || response.statusText}`);
      }

      const data = (await response.json()) as T & Record<string, unknown>;

      if (!response.ok) {
        const errData = data as Record<string, unknown>;
        const msg = errData.statusMessage ?? errData.message ?? response.statusText;
        throw new Error(`Duitku error [${response.status}]: ${msg}`);
      }

      return data;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Duitku request timeout (${DEFAULT_FETCH_TIMEOUT_MS}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Buat QRIS dinamis via Duitku createInvoice API.
   * Signature dihitung sebagai: MD5(merchantCode + paymentAmount + merchantOrderId + merchantKey)
   */
  async createDynamicQr(
    options: ApiQrCreateOptions,
    config: DuitkuConfig,
  ): Promise<ApiQrResult> {
    const signature = md5(
      config.merchantCode + options.amount + options.orderId + config.merchantKey,
    );

    const base = this.baseUrl(config.sandbox);
    // Use customerEmail if provided, otherwise use a traceable fallback derived from merchant
    const customerEmail = options.customerEmail ?? `no-reply+${config.merchantCode}@duitku.local`;
    const data = await this.request<Record<string, unknown>>(
      `${base}/createInvoice`,
      {
        merchantCode: config.merchantCode,
        paymentAmount: options.amount,
        merchantOrderId: options.orderId,
        productDetails: options.description ?? `Pembayaran ${options.orderId}`,
        email: customerEmail,
        paymentMethod: "QRIS",
        signature,
        returnUrl: config.returnUrl,
        callbackUrl: config.callbackUrl,
      },
    );

    const statusCode = String(data.statusCode ?? "");
    if (statusCode !== "00") {
      throw new Error(
        `Duitku createInvoice gagal [${statusCode}]: ${data.statusMessage ?? "unknown error"}`,
      );
    }

    const qrisString = typeof data.qrString === "string" ? data.qrString : null;
    if (!qrisString) {
      throw new Error("Duitku response tidak mengandung qrString");
    }

    return {
      qrisString,
      gatewayOrderId: options.orderId,
      raw: data,
    };
  }

  /**
   * Cek status pembayaran QRIS via Duitku transactionStatus API.
   * Signature dihitung sebagai: MD5(merchantCode + merchantOrderId + merchantKey)
   */
  async checkPaymentStatus(
    orderId: string,
    config: DuitkuConfig,
  ): Promise<PaymentStatusResult> {
    const signature = md5(
      config.merchantCode + orderId + config.merchantKey,
    );

    const base = this.baseUrl(config.sandbox);
    const data = await this.request<Record<string, unknown>>(
      `${base}/transactionStatus`,
      {
        merchantCode: config.merchantCode,
        merchantOrderId: orderId,
        signature,
      },
    );

    const statusCode = String(data.statusCode ?? "01");
    const status: PaymentStatusCode = STATUS_MAP[statusCode] ?? "pending";

    const amount =
      typeof data.amount === "string"
        ? parseFloat(data.amount)
        : typeof data.amount === "number"
          ? data.amount
          : undefined;

    return {
      orderId,
      status,
      ...(amount !== undefined && { amount }),
      raw: data,
    };
  }

  /**
   * Verify a Duitku webhook callback.
   * Duitku signs callbacks as: MD5(merchantCode + amount + merchantOrderId + merchantKey)
   * Compare against the `signature` field in the callback payload using constant-time comparison.
   */
  verifyWebhook(
    payload: Record<string, unknown>,
    config: Pick<DuitkuConfig, "merchantCode" | "merchantKey">,
  ): boolean {
    const merchantCode = String(payload.merchantCode ?? "");
    const amount = String(payload.amount ?? "");
    const merchantOrderId = String(payload.merchantOrderId ?? "");
    const expected = md5(merchantCode + amount + merchantOrderId + config.merchantKey);
    const providedSignature = String(payload.signature ?? "");

    // Use constant-time comparison to prevent timing attacks
    try {
      return (
        providedSignature.length === expected.length &&
        timingSafeEqual(Buffer.from(providedSignature, "utf8"), Buffer.from(expected, "utf8"))
      );
    } catch {
      // timingSafeEqual throws if lengths differ, return false
      return false;
    }
  }

  /**
   * Parse and verify a Duitku webhook callback into a normalised WebhookResult.
   */
  parseWebhook(
    payload: unknown,
    config: DuitkuConfig,
  ): WebhookResult {
    const raw = payload as Record<string, unknown>;
    const valid = this.verifyWebhook(raw, config);
    const statusCode = String(raw.resultCode ?? raw.statusCode ?? "01");
    const statusMap: Record<string, PaymentStatusCode> = {
      "00": "paid",
      "01": "pending",
      "02": "cancelled",
    };

    const amount = typeof raw.amount === "string"
      ? parseFloat(raw.amount)
      : typeof raw.amount === "number"
        ? raw.amount
        : undefined;

    return {
      valid,
      orderId: String(raw.merchantOrderId ?? ""),
      status: statusMap[statusCode] ?? "pending",
      ...(amount !== undefined && { amount }),
      raw: payload,
    };
  }

  /**
   * Poll payment status until a terminal state is reached or timeout elapses.
   */
  async pollPaymentStatus(
    orderId: string,
    config: DuitkuConfig,
    options?: PollOptions,
  ): Promise<PaymentStatusResult> {
    return pollUntilSettled(() => this.checkPaymentStatus(orderId, config), options);
  }
}

export const duitkuAdapter = new DuitkuAdapter();
