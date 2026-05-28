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
  EwalletPaymentResult,
  PaymentResult,
  ProviderCapabilities,
  VirtualAccountBank,
  VirtualAccountPaymentResult,
  WebhookResult,
  XenditConfig,
} from "./types";

const BASE_URL = "https://api.xendit.co";

const XENDIT_VA_BANK_CHANNELS: Partial<Record<VirtualAccountBank, string>> = {
  bca: "BCA",
  bni: "BNI",
  bri: "BRI",
  mandiri: "MANDIRI",
  permata: "PERMATA",
};
const XENDIT_EWALLET_CHANNELS: Partial<Record<EwalletChannel, string>> = {
  ovo: "ID_OVO",
  dana: "ID_DANA",
  linkaja: "ID_LINKAJA",
  shopeepay: "ID_SHOPEEPAY",
};
const XENDIT_CAPABILITIES: ProviderCapabilities = {
  qris: true,
  virtualAccount: { banks: ["bca", "bni", "bri", "mandiri", "permata"] },
  ewallet: { channels: ["ovo", "dana", "linkaja", "shopeepay"] },
  hostedCheckout: true,
};

function mapXenditInvoiceMethods(methods: CreateCheckoutRequest["enabledMethods"]): string[] | undefined {
  if (!methods?.length) return undefined;
  const mapped = new Set<string>();
  for (const method of methods) {
    if (method === "qris") mapped.add("QRIS");
    if (method === "virtual_account") {
      for (const bank of ["BCA", "BNI", "BRI", "MANDIRI", "PERMATA"]) mapped.add(bank);
    }
    if (method === "ewallet") {
      for (const channel of ["OVO", "DANA", "LINKAJA", "SHOPEEPAY"]) mapped.add(channel);
    }
  }
  return mapped.size > 0 ? Array.from(mapped) : undefined;
}

function invoiceDurationSeconds(expiresAt: Date | undefined): number | undefined {
  if (!expiresAt) return undefined;
  return Math.max(1, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}

function compactPaymentCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, "");
  return compact.length > 0 ? compact : undefined;
}

function normalizeXenditVaBank(code: unknown): VirtualAccountBank | undefined {
  if (typeof code !== "string") return undefined;
  const upper = code.toUpperCase();
  const entry = Object.entries(XENDIT_VA_BANK_CHANNELS).find(([, channel]) => channel === upper);
  return entry?.[0] as VirtualAccountBank | undefined;
}

function normalizeXenditEwalletChannel(code: unknown): EwalletChannel | undefined {
  if (typeof code !== "string") return undefined;
  const upper = code.toUpperCase();
  const entry = Object.entries(XENDIT_EWALLET_CHANNELS).find(([, channel]) => channel === upper);
  return entry?.[0] as EwalletChannel | undefined;
}

function xenditStatus(value: unknown): PaymentStatusCode {
  const status = String(value ?? "").toUpperCase();
  if (["PAID", "SUCCEEDED", "COMPLETED", "SUCCESS", "SETTLED"].includes(status)) return "paid";
  if (["EXPIRED"].includes(status)) return "expired";
  if (["FAILED"].includes(status)) return "failed";
  if (["VOIDED", "CANCELLED", "CANCELED", "INACTIVE"].includes(status)) return "cancelled";
  return "pending";
}

export class XenditAdapter implements GatewayAdapter {
  private authHeader(secretKey: string): string {
    return "Basic " + btoa(secretKey + ":");
  }

  private jsonHeaders(config: XenditConfig): Record<string, string> {
    return {
      Authorization: this.authHeader(config.secretKey),
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  capabilities(): ProviderCapabilities {
    return XENDIT_CAPABILITIES;
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
        headers: this.jsonHeaders(config),
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

  async createPayment(request: CreatePaymentRequest, config: XenditConfig): Promise<PaymentResult> {
    if (request.method === "qris") {
      const qr = await this.createDynamicQr(
        {
          orderId: request.orderId,
          amount: request.amount,
          ...(request.description ? { description: request.description } : {}),
          ...(request.customerEmail ? { customerEmail: request.customerEmail } : {}),
        },
        config,
      );

      return {
        provider: "xendit",
        method: "qris",
        orderId: request.orderId,
        gatewayOrderId: qr.gatewayOrderId,
        status: "pending",
        amount: request.amount,
        currency: "IDR",
        ...(qr.expiresAt ? { expiresAt: qr.expiresAt } : {}),
        qrisString: qr.qrisString,
        ...(qr.qrImageUrl ? { qrImageUrl: qr.qrImageUrl } : {}),
        ...(qr.gatewayTransactionId ? { gatewayTransactionId: qr.gatewayTransactionId } : {}),
        raw: qr.raw,
      };
    }

    if (request.method === "virtual_account") {
      return this.createVirtualAccountPayment(request, config);
    }

    if (request.method === "ewallet") {
      return this.createEwalletPayment(request, config);
    }

    throw new Error(`Xendit ${request.method} direct payment is not supported by this adapter yet.`);
  }

  private async createVirtualAccountPayment(
    request: CreateVirtualAccountPaymentRequest,
    config: XenditConfig,
  ): Promise<VirtualAccountPaymentResult> {
    const bankCode = XENDIT_VA_BANK_CHANNELS[request.bank];
    if (!bankCode) {
      throw new Error(`Xendit ${request.bank} virtual account direct payment is not supported by this adapter yet.`);
    }

    const data = await this.request<Record<string, unknown>>(`${BASE_URL}/callback_virtual_accounts`, {
      method: "POST",
      headers: this.jsonHeaders(config),
      body: JSON.stringify({
        external_id: request.orderId,
        bank_code: bankCode,
        name: request.customerName ?? "Customer",
        is_closed: true,
        expected_amount: request.amount,
        currency: "IDR",
        ...(request.expiresAt ? { expiration_date: request.expiresAt.toISOString() } : {}),
        ...(request.vaNumber ? { virtual_account_number: request.vaNumber } : {}),
        ...(request.description ? { description: request.description } : {}),
      }),
    });

    const vaNumber = compactPaymentCode(data.account_number ?? data.virtual_account_number);
    if (!vaNumber) throw new Error("Xendit response tidak mengandung account_number");
    const expiresAt = typeof data.expiration_date === "string" ? new Date(data.expiration_date) : undefined;

    return {
      provider: "xendit",
      method: "virtual_account",
      orderId: request.orderId,
      gatewayOrderId: String(data.id ?? request.orderId),
      status: xenditStatus(data.status),
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
    config: XenditConfig,
  ): Promise<EwalletPaymentResult> {
    const channelCode = XENDIT_EWALLET_CHANNELS[request.channel];
    if (!channelCode) {
      throw new Error(`Xendit ${request.channel} e-wallet direct payment is not supported by this adapter yet.`);
    }
    const channelProperties: Record<string, unknown> = {};
    if (request.channel === "ovo") {
      if (!request.customerPhone) throw new Error("Xendit OVO e-wallet payments require customerPhone.");
      channelProperties.mobile_number = request.customerPhone;
    }
    if (request.channel !== "ovo") {
      const redirectUrl = request.returnUrl ?? request.callbackUrl;
      if (!redirectUrl) {
        throw new Error("Xendit redirect-based e-wallet payments require returnUrl or callbackUrl.");
      }
      channelProperties.success_redirect_url = redirectUrl;
      channelProperties.failure_redirect_url = redirectUrl;
    }

    const data = await this.request<Record<string, unknown>>(`${BASE_URL}/ewallets/charges`, {
      method: "POST",
      headers: this.jsonHeaders(config),
      body: JSON.stringify({
        reference_id: request.orderId,
        currency: "IDR",
        amount: request.amount,
        checkout_method: "ONE_TIME_PAYMENT",
        channel_code: channelCode,
        ...(Object.keys(channelProperties).length > 0 ? { channel_properties: channelProperties } : {}),
        ...(request.metadata ? { metadata: request.metadata } : {}),
      }),
    });

    const actions = Array.isArray(data.actions) ? data.actions as Record<string, unknown>[] : [];
    const redirectAction = actions.find((action) => typeof action.url === "string");
    const paymentUrl = typeof redirectAction?.url === "string" ? redirectAction.url : undefined;

    return {
      provider: "xendit",
      method: "ewallet",
      orderId: request.orderId,
      gatewayOrderId: String(data.id ?? request.orderId),
      status: xenditStatus(data.status),
      amount: request.amount,
      currency: "IDR",
      channel: request.channel,
      ...(paymentUrl ? { paymentUrl, deeplinkUrl: paymentUrl } : {}),
      raw: data,
    };
  }

  async createCheckout(request: CreateCheckoutRequest, config: XenditConfig): Promise<CheckoutResult> {
    const invoiceDuration = invoiceDurationSeconds(request.expiresAt);
    const paymentMethods = mapXenditInvoiceMethods(request.enabledMethods);
    const data = await this.request<Record<string, unknown>>(`${BASE_URL}/v2/invoices`, {
      method: "POST",
      headers: this.jsonHeaders(config),
      body: JSON.stringify({
        external_id: request.orderId,
        amount: request.amount,
        currency: "IDR",
        description: request.description ?? `Payment ${request.orderId}`,
        ...(request.customerEmail ? { payer_email: request.customerEmail } : {}),
        ...(invoiceDuration ? { invoice_duration: invoiceDuration } : {}),
        ...(request.returnUrl ? { success_redirect_url: request.returnUrl } : {}),
        ...(paymentMethods ? { payment_methods: paymentMethods } : {}),
      }),
    });

    const checkoutUrl = typeof data.invoice_url === "string" ? data.invoice_url : null;
    if (!checkoutUrl) {
      throw new Error("Xendit invoice response tidak mengandung invoice_url");
    }

    const expiresAt = typeof data.expiry_date === "string" ? new Date(data.expiry_date) : undefined;
    return {
      provider: "xendit",
      orderId: request.orderId,
      gatewayOrderId: String(data.id ?? request.orderId),
      checkoutUrl,
      ...(expiresAt ? { expiresAt } : {}),
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
        provider: "xendit",
        method: "qris",
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
    if (payload === null || typeof payload !== "object") {
      throw new Error("Xendit webhook payload must be an object");
    }

    if (!config.callbackToken || !headers) {
      throw new Error("Xendit webhook verification not configured: missing callbackToken or headers");
    }

    const isValid = this.verifyWebhook(headers, config.callbackToken);
    if (!isValid) {
      throw new Error("Xendit webhook verification failed: invalid callback token");
    }

    const raw = payload as Record<string, unknown>;
    const data = (raw.data ?? raw) as Record<string, unknown>;

    const eventType = String(raw.event ?? "").toLowerCase();
    const orderId = String(data.reference_id ?? data.external_id ?? data.id ?? "");
    if (!orderId) {
      throw new Error("Xendit webhook error: reference_id, external_id, and id are missing from data");
    }

    let status: PaymentStatusCode = xenditStatus(data.status);
    const qrStatus = String(data.status ?? "").toUpperCase();
    const expiresAt = typeof data.expires_at === "string" ? new Date(data.expires_at) : null;

    if (eventType.includes("paid") || eventType.includes("completed") || qrStatus === "COMPLETED") {
      status = "paid";
    } else if (qrStatus === "INACTIVE") {
      status = expiresAt && expiresAt < new Date() ? "expired" : "cancelled";
    }

    const amount = typeof data.amount === "number"
      ? data.amount
      : typeof data.charge_amount === "number"
        ? data.charge_amount
        : typeof data.expected_amount === "number"
          ? data.expected_amount
          : undefined;
    const bank = normalizeXenditVaBank(data.bank_code);
    const channel = normalizeXenditEwalletChannel(data.channel_code);
    const vaNumber = compactPaymentCode(data.account_number ?? data.virtual_account_number);

    let paidAt: Date | undefined;
    if (status === "paid") {
      const payments = Array.isArray(data.payments) ? data.payments as Record<string, unknown>[] : [];
      const successfulPayment = payments.find(
        (p) => String(p.status).toUpperCase() === "SUCCEEDED",
      );
      if (successfulPayment && typeof successfulPayment.created === "string") {
        paidAt = new Date(successfulPayment.created);
      } else if (typeof data.created === "string") {
        paidAt = new Date(data.created);
      } else if (typeof data.updated === "string") {
        paidAt = new Date(data.updated);
      }
    }

    return {
      valid: true,
      orderId,
      status,
      ...(amount !== undefined && { amount }),
      ...(paidAt !== undefined && { paidAt }),
      provider: "xendit",
      ...(typeof data.id === "string" ? { gatewayTransactionId: data.id } : {}),
      ...(bank ? { method: "virtual_account" as const, bank } : {}),
      ...(channel ? { method: "ewallet" as const, channel } : {}),
      ...(!bank && !channel ? { method: "qris" as const } : {}),
      ...(vaNumber ? { vaNumber } : {}),
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
