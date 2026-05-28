import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
import type { GatewayAdapter } from "./adapter";
import { pollUntilSettled, type PollOptions } from "./poller";
import type { ApiQrCreateOptions, ApiQrResult, DuitkuConfig, WebhookResult } from "./types";

// transactionStatus: 00 success, 01 process/pending, 02 failed/expired.
const STATUS_MAP: Record<string, PaymentStatusCode> = {
  "00": "paid",
  "01": "pending",
  "02": "expired",
};

// callback resultCode: 00 success, 01 failed.
const CALLBACK_STATUS_MAP: Record<string, PaymentStatusCode> = {
  "00": "paid",
  "01": "failed",
};

const DEFAULT_FETCH_TIMEOUT_MS = 30000;
const DEFAULT_QRIS_PAYMENT_METHOD = "SP";

function hmacSha256(input: string, key: string): string {
  return createHmac("sha256", key).update(input).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  try {
    return a.length === b.length && timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

function parseAmount(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export class DuitkuAdapter implements GatewayAdapter {
  private baseUrl(sandbox = false): string {
    return sandbox
      ? "https://sandbox.duitku.com/webapi/api/merchant"
      : "https://passport.duitku.com/webapi/api/merchant";
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
        const msg = data.statusMessage ?? data.message ?? response.statusText;
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
   * Buat QRIS dinamis via Duitku Direct API.
   * Signature: HMAC-SHA256(merchantCode + merchantOrderId + paymentAmount, apiKey)
   */
  async createDynamicQr(
    options: ApiQrCreateOptions,
    config: DuitkuConfig,
  ): Promise<ApiQrResult> {
    const signature = hmacSha256(
      config.merchantCode + options.orderId + options.amount,
      config.merchantKey,
    );

    const data = await this.request<Record<string, unknown>>(
      `${this.baseUrl(config.sandbox)}/v2/inquiry`,
      {
        merchantCode: config.merchantCode,
        paymentAmount: options.amount,
        paymentMethod: config.paymentMethod ?? DEFAULT_QRIS_PAYMENT_METHOD,
        merchantOrderId: options.orderId,
        productDetails: options.description ?? `Pembayaran ${options.orderId}`,
        additionalParam: config.additionalParam ?? "",
        merchantUserInfo: config.merchantUserInfo ?? "",
        customerVaName: config.customerVaName ?? "Customer",
        email: options.customerEmail ?? `no-reply+${config.merchantCode}@duitku.local`,
        ...(config.phoneNumber ? { phoneNumber: config.phoneNumber } : {}),
        callbackUrl: config.callbackUrl,
        returnUrl: config.returnUrl,
        signature,
        ...(config.expiryPeriod !== undefined ? { expiryPeriod: config.expiryPeriod } : {}),
      },
    );

    const statusCode = String(data.statusCode ?? "");
    if (statusCode !== "00") {
      throw new Error(
        `Duitku inquiry gagal [${statusCode}]: ${data.statusMessage ?? "unknown error"}`,
      );
    }

    const qrisString = typeof data.qrString === "string" ? data.qrString : null;
    if (!qrisString) {
      throw new Error("Duitku response tidak mengandung qrString");
    }

    return {
      qrisString,
      gatewayOrderId: options.orderId,
      ...(typeof data.reference === "string" ? { gatewayTransactionId: data.reference } : {}),
      ...(typeof data.paymentUrl === "string" ? { qrImageUrl: data.paymentUrl } : {}),
      raw: data,
    };
  }

  /**
   * Cek status pembayaran QRIS via Duitku transactionStatus API.
   * Signature: HMAC-SHA256(merchantCode + merchantOrderId, apiKey)
   */
  async checkPaymentStatus(
    orderId: string,
    config: DuitkuConfig,
  ): Promise<PaymentStatusResult> {
    const signature = hmacSha256(config.merchantCode + orderId, config.merchantKey);

    const data = await this.request<Record<string, unknown>>(
      `${this.baseUrl(config.sandbox)}/transactionStatus`,
      {
        merchantCode: config.merchantCode,
        merchantOrderId: orderId,
        signature,
      },
    );

    const statusCode = String(data.statusCode ?? "01");
    const status: PaymentStatusCode = STATUS_MAP[statusCode] ?? "pending";
    const amount = parseAmount(data.amount);

    return {
      orderId,
      status,
      ...(amount !== undefined ? { amount } : {}),
      raw: data,
    };
  }

  /**
   * Verify a Duitku webhook callback.
   * Signature: HMAC-SHA256(merchantCode + amount + merchantOrderId, apiKey)
   */
  verifyWebhook(
    payload: Record<string, unknown>,
    config: Pick<DuitkuConfig, "merchantCode" | "merchantKey">,
  ): boolean {
    const merchantCode = String(payload.merchantCode ?? "");
    const amount = String(payload.amount ?? "");
    const merchantOrderId = String(payload.merchantOrderId ?? "");
    const expected = hmacSha256(merchantCode + amount + merchantOrderId, config.merchantKey);
    const providedSignature = String(payload.signature ?? "");
    return constantTimeEqual(providedSignature, expected);
  }

  parseWebhook(
    payload: unknown,
    config: DuitkuConfig,
  ): WebhookResult {
    if (payload === null || typeof payload !== "object") {
      return {
        valid: false,
        orderId: "",
        status: "pending",
        raw: payload,
      };
    }

    const raw = payload as Record<string, unknown>;
    const valid = this.verifyWebhook(raw, config);
    const statusCode = String(raw.resultCode ?? raw.statusCode ?? "01");
    const amount = parseAmount(raw.amount);

    const providerMeta: Record<string, unknown> = {};
    if (typeof raw.reference === "string") providerMeta.reference = raw.reference;
    if (typeof raw.paymentCode === "string") providerMeta.paymentCode = raw.paymentCode;
    if (typeof raw.issuerCode === "string") providerMeta.issuerCode = raw.issuerCode;
    if (typeof raw.settlementDate === "string") providerMeta.settlementDate = raw.settlementDate;

    return {
      valid,
      orderId: String(raw.merchantOrderId ?? ""),
      status: CALLBACK_STATUS_MAP[statusCode] ?? "pending",
      ...(amount !== undefined ? { amount } : {}),
      ...(Object.keys(providerMeta).length > 0 ? { providerMeta } : {}),
      raw: payload,
    };
  }

  async pollPaymentStatus(
    orderId: string,
    config: DuitkuConfig,
    options?: PollOptions,
  ): Promise<PaymentStatusResult> {
    return pollUntilSettled(() => this.checkPaymentStatus(orderId, config), options);
  }
}

export const duitkuAdapter = new DuitkuAdapter();
