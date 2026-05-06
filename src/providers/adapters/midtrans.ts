import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
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
    const data = (await response.json()) as T & Record<string, unknown>;

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

    const qrisString = typeof data.qr_string === "string" ? data.qr_string : null;
    if (!qrisString) {
      throw new Error("Midtrans response tidak mengandung qr_string");
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
}

export const midtransAdapter = new MidtransAdapter();
