import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
import type { ApiQrCreateOptions, ApiQrResult, XenditConfig } from "./types";

const BASE_URL = "https://api.xendit.co";

export class XenditAdapter {
  private authHeader(secretKey: string): string {
    return "Basic " + btoa(secretKey + ":");
  }

  private async request<T>(
    url: string,
    init: RequestInit,
  ): Promise<T> {
    const response = await fetch(url, init);
    const data = (await response.json()) as T & Record<string, unknown>;

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
}

export const xenditAdapter = new XenditAdapter();
