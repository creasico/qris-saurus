import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
import type { GatewayAdapter } from "./adapter";
import { pollUntilSettled, type PollOptions } from "./poller";
import type { ApiQrCreateOptions, ApiQrResult, WebhookResult, XenditConfig } from "./types";

const BASE_URL = "https://api.xendit.co";

export class XenditAdapter implements GatewayAdapter {
  private authHeader(secretKey: string): string {
    return "Basic " + btoa(secretKey + ":");
  }

  private async request<T>(
    url: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await fetch(url, init);

    let data: T & Record<string, unknown>;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      data = (await response.json()) as T & Record<string, unknown>;
    } else {
      const text = await response.text();
      throw new Error(`Xendit error [${response.status}]: ${text || response.statusText}`);
    }

    if (!response.ok) {
      const errData = data as Record<string, unknown>;
      const msg = errData.message ?? errData.error_code ?? response.statusText;
      throw new Error(`Xendit error [${response.status}]: ${msg}`);
    }

    return data;
  }

  /**
   * Buat QRIS dinamis via Xendit QR Codes API.
   * Satu integrasi mendukung semua e-wallet dan mobile banking yang terhubung ke QRIS.
   */
  async createDynamicQr(
    options: ApiQrCreateOptions,
    config: XenditConfig,
  ): Promise<ApiQrResult> {
    const data = await this.request<Record<string, unknown>>(
      `${BASE_URL}/qr_codes`,
      {
        method: "POST",
        headers: {
          Authorization: this.authHeader(config.secretKey),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          reference_id: options.orderId,
          type: "DYNAMIC",
          currency: "IDR",
          amount: options.amount,
          channel_code: "QRIS",
        }),
      },
    );

    const qrisString = typeof data.qr_string === "string" ? data.qr_string : null;
    if (!qrisString) {
      throw new Error("Xendit response tidak mengandung qr_string");
    }

    const expiresAt =
      typeof data.expires_at === "string" ? new Date(data.expires_at) : undefined;

    return {
      qrisString,
      gatewayOrderId: String(data.id ?? options.orderId),
      ...(expiresAt !== undefined && { expiresAt }),
      raw: data,
    };
  }

  /**
   * Cek status pembayaran QRIS via Xendit.
   * Gunakan gatewayOrderId yang dikembalikan dari createDynamicQr.
   *
   * Catatan: Xendit sangat merekomendasikan webhook untuk notifikasi real-time.
   * Endpoint ini untuk kebutuhan polling saja.
   */
  async checkPaymentStatus(
    gatewayOrderId: string,
    config: XenditConfig,
  ): Promise<PaymentStatusResult> {
    const data = await this.request<Record<string, unknown>>(
      `${BASE_URL}/qr_codes/${encodeURIComponent(gatewayOrderId)}`,
      {
        method: "GET",
        headers: {
          Authorization: this.authHeader(config.secretKey),
          Accept: "application/json",
        },
      },
    );

    // Cek apakah ada payment yang berhasil di dalam array payments
    const payments = Array.isArray(data.payments) ? data.payments as Record<string, unknown>[] : [];
    const successfulPayment = payments.find(
      (p) => String(p.status).toUpperCase() === "SUCCEEDED",
    );

    if (successfulPayment) {
      const paidAt =
        typeof successfulPayment.created === "string"
          ? new Date(successfulPayment.created)
          : undefined;

      const amount =
        typeof successfulPayment.amount === "number"
          ? successfulPayment.amount
          : typeof data.amount === "number"
            ? data.amount
            : undefined;

      return {
        orderId: gatewayOrderId,
        status: "paid",
        ...(amount !== undefined && { amount }),
        ...(paidAt !== undefined && { paidAt }),
        raw: data,
      };
    }

    // Tentukan status berdasarkan state QR code
    const qrStatus = String(data.status ?? "").toUpperCase();
    const expiresAt =
      typeof data.expires_at === "string" ? new Date(data.expires_at) : null;

    let status: PaymentStatusCode = "pending";

    if (qrStatus === "INACTIVE") {
      status = expiresAt && expiresAt < new Date() ? "expired" : "cancelled";
    }

    const amount = typeof data.amount === "number" ? data.amount : undefined;
    return {
      orderId: gatewayOrderId,
      status,
      ...(amount !== undefined && { amount }),
      raw: data,
    };
  }

  /**
   * Verify a Xendit webhook callback.
   * Xendit sends a `x-callback-token` header you configure in the dashboard.
   * Pass in the request headers and your configured callback token.
   */
  verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    callbackToken: string,
  ): boolean {
    if (!callbackToken) return false;
    const headerKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === "x-callback-token",
    );
    const received = headerKey ? String(headers[headerKey] ?? "") : "";
    return received === callbackToken;
  }

  /**
   * Parse and verify a Xendit webhook notification into a normalised WebhookResult.
   * Uses the `x-callback-token` header for verification if `callbackToken` is present in config.
   */
  parseWebhook(
    payload: unknown,
    config: XenditConfig,
    headers?: Record<string, string | string[] | undefined>,
  ): WebhookResult {
    const valid = config.callbackToken && headers
      ? this.verifyWebhook(headers, config.callbackToken)
      : false;

    const raw = payload as Record<string, unknown>;
    const data = (raw.data ?? raw) as Record<string, unknown>;

    const orderId = String(data.reference_id ?? data.id ?? "");
    const eventType = String(raw.event ?? "").toLowerCase();

    let status: PaymentStatusCode = "pending";
    const qrStatus = String(data.status ?? "").toUpperCase();
    if (eventType.includes("paid") || eventType.includes("completed") || qrStatus === "COMPLETED") {
      status = "paid";
    } else if (qrStatus === "INACTIVE" || qrStatus === "EXPIRED") {
      status = "expired";
    }

    const amount = typeof data.amount === "number" ? data.amount : undefined;
    const paidAt = status === "paid" && typeof data.created === "string"
      ? new Date(data.created)
      : undefined;

    return {
      valid,
      orderId,
      status,
      ...(amount !== undefined && { amount }),
      ...(paidAt !== undefined && { paidAt }),
      raw: payload,
    };
  }

  /**
   * Poll payment status until a terminal state is reached or timeout elapses.
   * Use `gatewayOrderId` returned from `createDynamicQr`.
   */
  async pollPaymentStatus(
    gatewayOrderId: string,
    config: XenditConfig,
    options?: PollOptions,
  ): Promise<PaymentStatusResult> {
    return pollUntilSettled(
      () => this.checkPaymentStatus(gatewayOrderId, config),
      options,
    );
  }
}

export const xenditAdapter = new XenditAdapter();
