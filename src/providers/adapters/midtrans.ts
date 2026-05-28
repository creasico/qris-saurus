import { createHash, timingSafeEqual } from "node:crypto";
import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
import type { GatewayAdapter } from "./adapter";
import { pollUntilSettled, type PollOptions } from "./poller";
import type {
  ApiQrCreateOptions,
  ApiQrResult,
  CheckoutResult,
  CreateCheckoutRequest,
  CreateEwalletPaymentRequest,
  CreatePaymentRequest,
  CreateVirtualAccountPaymentRequest,
  EwalletChannel,
  MidtransChargeResponse,
  MidtransConfig,
  MidtransNotificationOptions,
  MidtransWebhookParseResult,
  MidtransWebhookPayload,
  PaymentResult,
  ProviderCapabilities,
  RefundOptions,
  VirtualAccountBank,
  WebhookResult,
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

const MIDTRANS_CAPABILITIES: ProviderCapabilities = {
  qris: true,
  virtualAccount: { banks: ["bca", "bni", "bri", "permata", "cimb"] },
  ewallet: { channels: ["gopay", "shopeepay"] },
  hostedCheckout: true,
};

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

function mapMidtransSnapMethods(methods: CreateCheckoutRequest["enabledMethods"]): string[] | undefined {
  if (!methods?.length) return undefined;
  const mapped = new Set<string>();
  for (const method of methods) {
    if (method === "qris") mapped.add("qris");
    if (method === "virtual_account") mapped.add("bank_transfer");
    if (method === "ewallet") {
      mapped.add("gopay");
      mapped.add("shopeepay");
    }
  }
  return mapped.size > 0 ? Array.from(mapped) : undefined;
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

function normalizeMidtransMethod(paymentType: unknown): "qris" | "virtual_account" | "ewallet" | undefined {
  const type = String(paymentType ?? "").toLowerCase();
  if (type === "qris") return "qris";
  if (type === "bank_transfer" || type === "permata") return "virtual_account";
  if (type === "gopay" || type === "shopeepay") return "ewallet";
  return undefined;
}

function normalizeMidtransBank(data: Pick<MidtransChargeResponse, "payment_type" | "va_numbers">): "bca" | "bni" | "bri" | "cimb" | "permata" | undefined {
  if (data.payment_type === "permata") return "permata";
  const bank = data.va_numbers?.[0]?.bank;
  return bank === "bca" || bank === "bni" || bank === "bri" || bank === "cimb" ? bank : undefined;
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

export class MidtransAdapter implements GatewayAdapter {
  private baseUrl(sandbox = false): string {
    return sandbox
      ? "https://api.sandbox.midtrans.com/v2"
      : "https://api.midtrans.com/v2";
  }

  private snapBaseUrl(sandbox = false): string {
    return sandbox
      ? "https://app.sandbox.midtrans.com/snap/v1"
      : "https://app.midtrans.com/snap/v1";
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

  capabilities(): ProviderCapabilities {
    return MIDTRANS_CAPABILITIES;
  }

  private paymentHeaders(config: MidtransConfig, notificationOptions: MidtransNotificationOptions = {}) {
    return {
      Authorization: this.authHeader(config.serverKey),
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(notificationOptions.overrideNotificationUrl
        ? { "X-Override-Notification": notificationOptions.overrideNotificationUrl }
        : {}),
      ...(notificationOptions.appendNotificationUrls?.length
        ? { "X-Append-Notification": notificationOptions.appendNotificationUrls.join(",") }
        : {}),
    };
  }

  private customerDetails(request: CreatePaymentRequest | CreateCheckoutRequest): Record<string, string> | undefined {
    const details: Record<string, string> = {};
    if (request.customerName) details.first_name = request.customerName;
    if (request.customerEmail) details.email = request.customerEmail;
    if (request.customerPhone) details.phone = request.customerPhone;
    return Object.keys(details).length > 0 ? details : undefined;
  }

  private expiryPayload(value: Date | undefined): Record<string, string> | undefined {
    if (!value) return undefined;
    return {
      unit: "second",
      duration: Math.max(1, Math.floor((value.getTime() - Date.now()) / 1000)).toString(),
    };
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
      headers: this.paymentHeaders(config, notificationOptions),
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

  async createPayment(
    request: CreatePaymentRequest,
    config: MidtransConfig,
    notificationOptions: MidtransNotificationOptions = {},
  ): Promise<PaymentResult> {
    if (request.method === "qris") {
      const qr = await this.createDynamicQr(request, config, notificationOptions);
      return {
        provider: "midtrans",
        method: "qris",
        orderId: request.orderId,
        gatewayOrderId: qr.gatewayOrderId,
        status: "pending",
        amount: request.amount,
        currency: "IDR",
        ...(qr.expiresAt ? { expiresAt: qr.expiresAt } : {}),
        qrisString: qr.qrisString,
        ...(qr.qrImageUrl ? { qrImageUrl: qr.qrImageUrl } : {}),
        ...(qr.qrImageUrlV2 ? { qrImageUrlV2: qr.qrImageUrlV2 } : {}),
        ...(qr.gatewayTransactionId ? { gatewayTransactionId: qr.gatewayTransactionId } : {}),
        ...(qr.acquirer ? { acquirer: qr.acquirer } : {}),
        raw: qr.raw,
      };
    }

    if (request.method === "virtual_account") {
      return this.createVirtualAccountPayment(request, config, notificationOptions);
    }

    if (request.method === "ewallet") {
      return this.createEwalletPayment(request, config, notificationOptions);
    }

    throw new Error("Midtrans payment_link requires createCheckout() / Snap hosted checkout.");
  }

  private async createVirtualAccountPayment(
    request: CreateVirtualAccountPaymentRequest,
    config: MidtransConfig,
    notificationOptions: MidtransNotificationOptions,
  ): Promise<PaymentResult> {
    const body: Record<string, unknown> = {
      payment_type: request.bank === "permata" ? "permata" : "bank_transfer",
      transaction_details: {
        order_id: request.orderId,
        gross_amount: request.amount,
      },
    };

    const customerDetails = this.customerDetails(request);
    if (customerDetails) body.customer_details = customerDetails;
    const expiry = this.expiryPayload(request.expiresAt);
    if (expiry) body.custom_expiry = expiry;

    if (request.bank !== "permata") {
      body.bank_transfer = {
        bank: request.bank,
        ...(request.vaNumber ? { va_number: request.vaNumber } : {}),
      };
    }

    const data = await this.request<MidtransChargeResponse>(`${this.baseUrl(config.sandbox)}/charge`, {
      method: "POST",
      headers: this.paymentHeaders(config, notificationOptions),
      body: JSON.stringify(body),
    });

    const vaNumber = request.bank === "permata"
      ? data.permata_va_number
      : data.va_numbers?.[0]?.va_number;
    if (!vaNumber) {
      throw new Error("Midtrans response tidak mengandung nomor virtual account");
    }
    const expiresAt = parseMidtransDate(data.expiry_time);

    return {
      provider: "midtrans",
      method: "virtual_account",
      orderId: request.orderId,
      gatewayOrderId: String(data.order_id ?? request.orderId),
      ...(typeof data.transaction_id === "string" ? { gatewayTransactionId: data.transaction_id } : {}),
      status: STATUS_MAP[String(data.transaction_status ?? "pending").toLowerCase()] ?? "pending",
      amount: request.amount,
      currency: "IDR",
      bank: request.bank,
      vaNumber,
      ...(expiresAt ? { expiresAt } : {}),
      raw: data,
    };
  }

  private async createEwalletPayment(
    request: CreateEwalletPaymentRequest,
    config: MidtransConfig,
    notificationOptions: MidtransNotificationOptions,
  ): Promise<PaymentResult> {
    if (request.channel !== "gopay" && request.channel !== "shopeepay") {
      throw new Error(`Midtrans e-wallet channel "${request.channel}" is not supported by this adapter.`);
    }

    const body: Record<string, unknown> = {
      payment_type: request.channel,
      transaction_details: {
        order_id: request.orderId,
        gross_amount: request.amount,
      },
    };

    const customerDetails = this.customerDetails(request);
    if (customerDetails) body.customer_details = customerDetails;
    const expiry = this.expiryPayload(request.expiresAt);
    if (expiry) body.custom_expiry = expiry;
    if (request.channel === "gopay") {
      body.gopay = {
        enable_callback: Boolean(request.callbackUrl),
        ...(request.callbackUrl ? { callback_url: request.callbackUrl } : {}),
      };
    }
    if (request.channel === "shopeepay" && request.callbackUrl) {
      body.shopeepay = { callback_url: request.callbackUrl };
    }

    const data = await this.request<MidtransChargeResponse>(`${this.baseUrl(config.sandbox)}/charge`, {
      method: "POST",
      headers: this.paymentHeaders(config, notificationOptions),
      body: JSON.stringify(body),
    });

    const paymentUrl = getMidtransActionUrl(data.actions, "deeplink-redirect")
      ?? getMidtransActionUrl(data.actions, "mobile_deeplink_redirect")
      ?? getMidtransActionUrl(data.actions, "web_checkout_url");
    const qrString = getMidtransActionUrl(data.actions, "generate-qr-code")
      ?? getMidtransActionUrl(data.actions, "generate-qr-code-v2");

    return {
      provider: "midtrans",
      method: "ewallet",
      orderId: request.orderId,
      gatewayOrderId: String(data.order_id ?? request.orderId),
      ...(typeof data.transaction_id === "string" ? { gatewayTransactionId: data.transaction_id } : {}),
      status: STATUS_MAP[String(data.transaction_status ?? "pending").toLowerCase()] ?? "pending",
      amount: request.amount,
      currency: "IDR",
      channel: request.channel,
      ...(paymentUrl ? { paymentUrl, deeplinkUrl: paymentUrl } : {}),
      ...(qrString ? { qrImageUrl: qrString } : {}),
      raw: data,
    };
  }

  async createCheckout(
    request: CreateCheckoutRequest,
    config: MidtransConfig,
    notificationOptions: MidtransNotificationOptions = {},
  ): Promise<CheckoutResult> {
    const customerDetails = this.customerDetails(request);
    const expiry = this.expiryPayload(request.expiresAt);
    const enabledPayments = mapMidtransSnapMethods(request.enabledMethods);
    const data = await this.request<{ token?: string; redirect_url?: string } & Record<string, unknown>>(
      `${this.snapBaseUrl(config.sandbox)}/transactions`,
      {
        method: "POST",
        headers: this.paymentHeaders(config, notificationOptions),
        body: JSON.stringify({
          transaction_details: {
            order_id: request.orderId,
            gross_amount: request.amount,
          },
          ...(customerDetails ? { customer_details: customerDetails } : {}),
          ...(expiry ? { custom_expiry: expiry } : {}),
          ...(enabledPayments ? { enabled_payments: enabledPayments } : {}),
        }),
      },
    );

    if (typeof data.redirect_url !== "string") {
      throw new Error("Midtrans Snap response tidak mengandung redirect_url");
    }

    return {
      provider: "midtrans",
      orderId: request.orderId,
      gatewayOrderId: request.orderId,
      checkoutUrl: data.redirect_url,
      ...(typeof data.token === "string" ? { token: data.token } : {}),
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

    const method = normalizeMidtransMethod(data.payment_type);
    const bank = method === "virtual_account" ? normalizeMidtransBank(data) : undefined;
    const channel = method === "ewallet" && (data.payment_type === "gopay" || data.payment_type === "shopeepay")
      ? data.payment_type
      : undefined;
    const vaNumber = data.va_numbers?.[0]?.va_number ?? data.permata_va_number;

    return {
      provider: "midtrans",
      orderId,
      status,
      ...(grossAmount !== undefined && { amount: grossAmount }),
      ...(paidAt !== undefined && { paidAt }),
      ...(typeof data.transaction_id === "string" ? { gatewayTransactionId: data.transaction_id } : {}),
      ...(method !== undefined ? { method } : {}),
      ...(bank !== undefined ? { bank } : {}),
      ...(channel !== undefined ? { channel } : {}),
      ...(vaNumber !== undefined ? { vaNumber } : {}),
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
  ): WebhookResult {
    const valid = this.verifyWebhook(payload, config);
    const orderId = String(payload.order_id ?? "");
    const status = this.getWebhookStatus(payload);
    const amount = payload.gross_amount !== undefined
      ? parseFloat(String(payload.gross_amount))
      : undefined;
    const paidAt = status === "paid"
      ? parseMidtransDate(payload.settlement_time)
      : undefined;

    const method = normalizeMidtransMethod(payload.payment_type);
    const channel = method === "ewallet" && (payload.payment_type === "gopay" || payload.payment_type === "shopeepay")
      ? payload.payment_type
      : undefined;

    const providerMeta: Record<string, unknown> = {};
    if (typeof payload.fraud_status === "string") providerMeta.fraudStatus = payload.fraud_status;
    if (typeof payload.transaction_id === "string") providerMeta.transactionId = payload.transaction_id;
    if (typeof payload.payment_type === "string") providerMeta.paymentType = payload.payment_type;
    if (typeof payload.acquirer === "string") providerMeta.acquirer = payload.acquirer;

    return {
      provider: "midtrans",
      valid,
      orderId,
      status,
      ...(amount !== undefined && !Number.isNaN(amount) ? { amount } : {}),
      ...(paidAt !== undefined ? { paidAt } : {}),
      ...(typeof payload.transaction_id === "string" ? { gatewayTransactionId: payload.transaction_id } : {}),
      ...(method !== undefined ? { method } : {}),
      ...(channel !== undefined ? { channel } : {}),
      ...(Object.keys(providerMeta).length > 0 ? { providerMeta } : {}),
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
