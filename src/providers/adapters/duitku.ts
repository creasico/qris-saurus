import { createHash } from "node:crypto";
import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
import { pollUntilSettled, type PollOptions } from "./poller";
import type { ApiQrCreateOptions, ApiQrResult, DuitkuConfig } from "./types";

// statusCode dari Duitku: "00" lunas, "01" pending, "02" dibatalkan
const STATUS_MAP: Record<string, PaymentStatusCode> = {
  "00": "paid",
  "01": "pending",
  "02": "cancelled",
};

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

export class DuitkuAdapter {
  private baseUrl(sandbox = false): string {
    return sandbox
      ? "https://sandbox.duitku.com/webapi/api/merchant"
      : "https://api-prod.duitku.com/api/merchant";
  }

  private async request<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as T & Record<string, unknown>;

    if (!response.ok) {
      const errData = data as Record<string, unknown>;
      const msg = errData.statusMessage ?? errData.message ?? response.statusText;
      throw new Error(`Duitku error [${response.status}]: ${msg}`);
    }

    return data;
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
    const data = await this.request<Record<string, unknown>>(
      `${base}/createInvoice`,
      {
        merchantCode: config.merchantCode,
        paymentAmount: options.amount,
        merchantOrderId: options.orderId,
        productDetails: options.description ?? `Pembayaran ${options.orderId}`,
        email: options.customerEmail ?? "customer@example.com",
        paymentMethod: "QRIS",
        signature,
        returnUrl: "https://example.com/return",
        callbackUrl: "https://example.com/callback",
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
   * Compare against the `signature` field in the callback payload.
   */
  verifyWebhook(
    payload: Record<string, unknown>,
    config: Pick<DuitkuConfig, "merchantCode" | "merchantKey">,
  ): boolean {
    const merchantCode = String(payload.merchantCode ?? "");
    const amount = String(payload.amount ?? "");
    const merchantOrderId = String(payload.merchantOrderId ?? "");
    const expected = md5(merchantCode + amount + merchantOrderId + config.merchantKey);
    return typeof payload.signature === "string" && payload.signature === expected;
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
