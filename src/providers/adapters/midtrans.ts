import { createHash } from "node:crypto";
import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
import { pollUntilSettled, type PollOptions } from "./poller";
import type { ApiQrCreateOptions, ApiQrResult, MidtransConfig } from "./types";

const STATUS_MAP: Record<string, PaymentStatusCode> = {
  pending: "pending",
  settlement: "paid",
  capture: "paid",
  refund: "paid",
  expire: "expired",
  cancel: "cancelled",
  deny: "failed",
  failure: "failed",
};

export class MidtransAdapter {
  private baseUrl(sandbox = false): string {
    return sandbox
      ? "https://api.sandbox.midtrans.com/v2"
      : "https://api.midtrans.com/v2";
  }

  private authHeader(serverKey: string): string {
    return "Basic " + btoa(serverKey + ":");
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
      throw new Error(`Midtrans error [${response.status}]: ${text || response.statusText}`);
    }

    if (!response.ok) {
      const msg = (data as Record<string, unknown>).status_message ?? response.statusText;
      throw new Error(`Midtrans error [${response.status}]: ${msg}`);
    }

    return data;
  }

  /**
   * Buat QRIS dinamis via Midtrans Core API.
   * Requires server key dari Midtrans dashboard.
   */
  async createDynamicQr(
    options: ApiQrCreateOptions,
    config: MidtransConfig,
  ): Promise<ApiQrResult> {
    const url = `${this.baseUrl(config.sandbox)}/charge`;
    const data = await this.request<Record<string, unknown>>(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(config.serverKey),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        payment_type: "qris",
        transaction_details: {
          order_id: options.orderId,
          gross_amount: options.amount,
        },
      }),
    });

    // Midtrans dapat mengembalikan qr_string langsung, atau URL QR image via actions[].url
    let qrisString: string | null = typeof data.qr_string === "string" ? data.qr_string : null;
    if (!qrisString && Array.isArray(data.actions)) {
      const actions = data.actions as Array<Record<string, unknown>>;
      const generateAction = actions.find((a) => a.name === "generate-qr-code");
      const url = generateAction?.url ?? actions[0]?.url;
      if (typeof url === "string") {
        qrisString = url;
      }
    }
    if (!qrisString) {
      throw new Error("Midtrans response tidak mengandung qr_string atau actions[].url");
    }

    return {
      qrisString,
      gatewayOrderId: options.orderId,
      raw: data,
    };
  }

  /**
   * Cek apakah pembayaran QRIS sudah lunas.
   * Gunakan orderId yang sama dengan yang dikirim saat createDynamicQr.
   */
  async checkPaymentStatus(
    orderId: string,
    config: MidtransConfig,
  ): Promise<PaymentStatusResult> {
    const url = `${this.baseUrl(config.sandbox)}/${encodeURIComponent(orderId)}/status`;
    const data = await this.request<Record<string, unknown>>(url, {
      method: "GET",
      headers: {
        Authorization: this.authHeader(config.serverKey),
        Accept: "application/json",
      },
    });

    const txStatus = String(data.transaction_status ?? "pending");
    const status: PaymentStatusCode = STATUS_MAP[txStatus] ?? "pending";

    const grossAmount = data.gross_amount
      ? parseFloat(String(data.gross_amount))
      : undefined;

    const paidAt =
      status === "paid" && typeof data.settlement_time === "string"
        ? new Date(data.settlement_time)
        : undefined;

    return {
      orderId,
      status,
      ...(grossAmount !== undefined && { amount: grossAmount }),
      ...(paidAt !== undefined && { paidAt }),
      raw: data,
    };
  }

  /**
   * Verify a Midtrans webhook notification.
   * Midtrans signs webhooks as: SHA512(orderId + statusCode + grossAmount + serverKey)
   * Compare against the `signature_key` field in the webhook payload.
   */
  verifyWebhook(
    payload: Record<string, unknown>,
    config: Pick<MidtransConfig, "serverKey">,
  ): boolean {
    const orderId = String(payload.order_id ?? "");
    const statusCode = String(payload.status_code ?? "");
    const grossAmount = String(payload.gross_amount ?? "");
    const expected = createHash("sha512")
      .update(orderId + statusCode + grossAmount + config.serverKey)
      .digest("hex");
    return (
      typeof payload.signature_key === "string" &&
      payload.signature_key === expected
    );
  }

  /**
   * Poll payment status until a terminal state is reached or timeout elapses.
   * Terminal states: paid, expired, failed, cancelled.
   */
  async pollPaymentStatus(
    orderId: string,
    config: MidtransConfig,
    options?: PollOptions,
  ): Promise<PaymentStatusResult> {
    return pollUntilSettled(() => this.checkPaymentStatus(orderId, config), options);
  }
}

export const midtransAdapter = new MidtransAdapter();
