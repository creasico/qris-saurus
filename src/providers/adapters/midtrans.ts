import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
import { pollUntilSettled, type PollOptions } from "./poller";
import type {
  ApiQrCreateOptions,
  ApiQrResult,
  MidtransChargeResponse,
  MidtransConfig,
  MidtransNotificationOptions,
  MidtransWebhookParseResult,
  MidtransWebhookPayload,
  RefundOptions,
} from "./types";

const STATUS_MAP: Record<string, PaymentStatusCode> = {
  pending: "pending",
  settlement: "paid",
  capture: "paid",
  refund: "refunded",
  expire: "expired",
  cancel: "cancelled",
  deny: "failed",
  failure: "failed",
};

const DEFAULT_FETCH_TIMEOUT_MS = 30000; // 30 seconds

function parseMidtransDate(value: unknown): Date | undefined {
  return typeof value === "string" ? new Date(value) : undefined;
}

function getMidtransActionUrl(
  actions: MidtransChargeResponse["actions"],
  actionName: string,
): string | undefined {
  if (!Array.isArray(actions)) return undefined;
  const action = actions.find((item) => item?.name === actionName);
  return typeof action?.url === "string" ? action.url : undefined;
}

function buildMidtransSignature(
  payload: Pick<MidtransWebhookPayload, "order_id" | "status_code" | "gross_amount">,
  serverKey: string,
): string {
  const orderId = String(payload.order_id ?? "");
  const statusCode = String(payload.status_code ?? "");
  const grossAmount = String(payload.gross_amount ?? "");
  return createHash("sha512")
    .update(orderId + statusCode + grossAmount + serverKey)
    .digest("hex");
}

function mapMidtransTransactionStatus(payload: MidtransWebhookPayload): PaymentStatusCode {
  const transactionStatus = String(payload.transaction_status ?? "pending").toLowerCase();
  const fraudStatus = typeof payload.fraud_status === "string"
    ? payload.fraud_status.toLowerCase()
    : undefined;

  if (transactionStatus === "settlement") {
    return fraudStatus === "accept" || fraudStatus === undefined ? "paid" : "pending";
  }

  return STATUS_MAP[transactionStatus] ?? "pending";
}

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

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
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Midtrans request timeout (${DEFAULT_FETCH_TIMEOUT_MS}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Buat QRIS dinamis via Midtrans Core API.
   * Requires server key dari Midtrans dashboard.
   */
  async createDynamicQr(
    options: ApiQrCreateOptions,
    config: MidtransConfig,
    notificationOptions: MidtransNotificationOptions = {},
  ): Promise<ApiQrResult> {
    const url = `${this.baseUrl(config.sandbox)}/charge`;
    const data = await this.request<MidtransChargeResponse>(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(config.serverKey),
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(notificationOptions.overrideNotificationUrl
          ? { "X-Override-Notification": notificationOptions.overrideNotificationUrl }
          : {}),
        ...(notificationOptions.appendNotificationUrls?.length
          ? { "X-Append-Notification": notificationOptions.appendNotificationUrls.join(",") }
          : {}),
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

    const qrImageUrl = getMidtransActionUrl(data.actions, "generate-qr-code");
    const qrImageUrlV2 = getMidtransActionUrl(data.actions, "generate-qr-code-v2");
    const expiresAt = parseMidtransDate(data.expiry_time);

    return {
      qrisString,
      gatewayOrderId: String(data.order_id ?? options.orderId),
      ...(expiresAt !== undefined && { expiresAt }),
      ...(qrImageUrl ? { qrImageUrl } : {}),
      ...(qrImageUrlV2 ? { qrImageUrlV2 } : {}),
      ...(typeof data.transaction_id === "string"
        ? { gatewayTransactionId: data.transaction_id }
        : {}),
      ...(typeof data.acquirer === "string" ? { acquirer: data.acquirer } : {}),
      ...(typeof data.payment_type === "string" ? { paymentType: data.payment_type } : {}),
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
    const data = await this.request<MidtransChargeResponse>(url, {
      method: "GET",
      headers: {
        Authorization: this.authHeader(config.serverKey),
        Accept: "application/json",
      },
    });

    const txStatus = String(data.transaction_status ?? "pending").toLowerCase();
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
    payload: MidtransWebhookPayload,
    config: Pick<MidtransConfig, "serverKey">,
  ): boolean {
    const expected = buildMidtransSignature(payload, config.serverKey);
    const providedSignature = typeof payload.signature_key === "string"
      ? payload.signature_key
      : "";

    try {
      return (
        providedSignature.length === expected.length
        && timingSafeEqual(Buffer.from(providedSignature, "utf8"), Buffer.from(expected, "utf8"))
      );
    } catch {
      return false;
    }
  }

  /**
   * Normalize Midtrans transaction_status/fraud_status into SDK payment status.
   */
  getWebhookStatus(payload: MidtransWebhookPayload): PaymentStatusCode {
    return mapMidtransTransactionStatus(payload);
  }

  /**
   * Parse and validate a Midtrans webhook notification into a normalized result.
   */
  parseWebhook(
    payload: MidtransWebhookPayload,
    config: Pick<MidtransConfig, "serverKey">,
  ): MidtransWebhookParseResult {
    const valid = this.verifyWebhook(payload, config);
    const orderId = String(payload.order_id ?? "");
    const status = this.getWebhookStatus(payload);
    const amount = payload.gross_amount !== undefined
      ? parseFloat(String(payload.gross_amount))
      : undefined;
    const paidAt = status === "paid"
      ? parseMidtransDate(payload.settlement_time)
      : undefined;

    return {
      valid,
      orderId,
      status,
      ...(amount !== undefined && !Number.isNaN(amount) ? { amount } : {}),
      ...(paidAt !== undefined ? { paidAt } : {}),
      ...(typeof payload.fraud_status === "string" ? { fraudStatus: payload.fraud_status } : {}),
      ...(typeof payload.transaction_id === "string" ? { transactionId: payload.transaction_id } : {}),
      ...(typeof payload.payment_type === "string" ? { paymentType: payload.payment_type } : {}),
      ...(typeof payload.acquirer === "string" ? { acquirer: payload.acquirer } : {}),
      raw: payload,
    };
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

  /**
   * Batalkan transaksi yang masih pending atau belum lunas.
   */
  async cancel(orderId: string, config: MidtransConfig): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl(config.sandbox)}/${encodeURIComponent(orderId)}/cancel`;
    return this.request<Record<string, unknown>>(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(config.serverKey),
        Accept: "application/json",
      },
    });
  }

  /**
   * Paksa kadaluarsa transaksi yang masih pending.
   */
  async expire(orderId: string, config: MidtransConfig): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl(config.sandbox)}/${encodeURIComponent(orderId)}/expire`;
    return this.request<Record<string, unknown>>(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(config.serverKey),
        Accept: "application/json",
      },
    });
  }

  /**
   * Refund transaksi yang sudah settlement.
   */
  async refund(
    orderId: string,
    config: MidtransConfig,
    options: RefundOptions = {},
  ): Promise<Record<string, unknown>> {
    const url = `${this.baseUrl(config.sandbox)}/${encodeURIComponent(orderId)}/refund`;
    return this.request<Record<string, unknown>>(url, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(config.serverKey),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        refund_key: options.refundKey,
        amount: options.amount,
        reason: options.reason,
      }),
    });
  }
}

export const midtransAdapter = new MidtransAdapter();
