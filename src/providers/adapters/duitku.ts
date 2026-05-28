import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
import type { GatewayAdapter } from "./adapter";
import { pollUntilSettled, type PollOptions } from "./poller";
import type {
  ApiQrCreateOptions,
  ApiQrResult,
  CreateEwalletPaymentRequest,
  CreatePaymentRequest,
  CreateVirtualAccountPaymentRequest,
  DuitkuConfig,
  EwalletChannel,
  EwalletPaymentResult,
  PaymentResult,
  ProviderCapabilities,
  VirtualAccountBank,
  VirtualAccountPaymentResult,
  WebhookParseOptions,
  WebhookResult,
} from "./types";

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
const DUITKU_VA_BANK_METHODS: Record<VirtualAccountBank, string> = {
  bca: "BC",
  bni: "I1",
  bri: "BR",
  mandiri: "M2",
  permata: "BT",
  cimb: "B1",
};
const DUITKU_EWALLET_METHODS: Partial<Record<EwalletChannel, string>> = {
  ovo: "OV",
  shopeepay: "SA",
  dana: "DA",
  linkaja: "LF",
};
const DUITKU_CAPABILITIES: ProviderCapabilities = {
  qris: true,
  virtualAccount: { banks: ["bca", "bni", "bri", "mandiri", "permata", "cimb"] },
  ewallet: { channels: ["ovo", "shopeepay", "dana", "linkaja"] },
};
const DEFAULT_QRIS_PAYMENT_METHOD = "SP";
const MAX_PROVIDER_ERROR_MESSAGE_LENGTH = 160;

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

function compactPaymentCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const compact = value.replace(/\s+/g, "");
  return compact.length > 0 ? compact : undefined;
}

function normalizeDuitkuVaBank(code: unknown): VirtualAccountBank | undefined {
  if (typeof code !== "string") return undefined;
  const entry = Object.entries(DUITKU_VA_BANK_METHODS).find(([, method]) => method === code);
  return entry?.[0] as VirtualAccountBank | undefined;
}

function normalizeDuitkuEwalletChannel(code: unknown): EwalletChannel | undefined {
  if (typeof code !== "string") return undefined;
  const entry = Object.entries(DUITKU_EWALLET_METHODS).find(([, method]) => method === code);
  return entry?.[0] as EwalletChannel | undefined;
}

function sanitizeProviderMessage(value: unknown): string {
  const message = typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : "request failed";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, MAX_PROVIDER_ERROR_MESSAGE_LENGTH);
}

function createProviderError(message: string, cause?: unknown): Error {
  const error = new Error(message);
  if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

function invalidWebhookResult(raw: unknown): WebhookResult {
  return { valid: false, orderId: "", status: "pending", raw };
}

export class DuitkuAdapter implements GatewayAdapter {
  capabilities(): ProviderCapabilities {
    return DUITKU_CAPABILITIES;
  }

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
        await response.text();
        throw new Error(
          `Duitku error [${response.status}]: ${sanitizeProviderMessage(response.statusText)}`,
        );
      }

      const data = (await response.json()) as T & Record<string, unknown>;

      if (!response.ok) {
        const msg = sanitizeProviderMessage(data.statusMessage ?? data.message ?? response.statusText);
        throw createProviderError(`Duitku error [${response.status}]: ${msg}`, data);
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

  private async createInquiry(
    request: Pick<ApiQrCreateOptions, "orderId" | "amount" | "description" | "customerEmail"> & {
      customerName?: string;
      customerPhone?: string;
    },
    paymentMethod: string,
    config: DuitkuConfig,
  ): Promise<Record<string, unknown>> {
    const signature = hmacSha256(
      config.merchantCode + request.orderId + request.amount,
      config.merchantKey,
    );

    return this.request<Record<string, unknown>>(
      `${this.baseUrl(config.sandbox)}/v2/inquiry`,
      {
        merchantCode: config.merchantCode,
        paymentAmount: request.amount,
        paymentMethod,
        merchantOrderId: request.orderId,
        productDetails: request.description ?? `Pembayaran ${request.orderId}`,
        additionalParam: config.additionalParam ?? "",
        merchantUserInfo: config.merchantUserInfo ?? "",
        customerVaName: request.customerName ?? config.customerVaName ?? "Customer",
        email: request.customerEmail ?? `no-reply+${config.merchantCode}@duitku.local`,
        ...(request.customerPhone || config.phoneNumber
          ? { phoneNumber: request.customerPhone ?? config.phoneNumber }
          : {}),
        callbackUrl: config.callbackUrl,
        returnUrl: config.returnUrl,
        signature,
        ...(config.expiryPeriod !== undefined ? { expiryPeriod: config.expiryPeriod } : {}),
      },
    );
  }

  /**
   * Buat QRIS dinamis via Duitku Direct API.
   * Signature: HMAC-SHA256(merchantCode + merchantOrderId + paymentAmount, apiKey)
   */
  async createDynamicQr(
    options: ApiQrCreateOptions,
    config: DuitkuConfig,
  ): Promise<ApiQrResult> {
    const data = await this.createInquiry(
      options,
      config.paymentMethod ?? DEFAULT_QRIS_PAYMENT_METHOD,
      config,
    );

    const statusCode = String(data.statusCode ?? "");
    if (statusCode !== "00") {
      throw createProviderError(
        `Duitku inquiry gagal [${statusCode}]: ${sanitizeProviderMessage(data.statusMessage)}`,
        data,
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

  async createPayment(request: CreatePaymentRequest, config: DuitkuConfig): Promise<PaymentResult> {
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
        provider: "duitku",
        method: "qris",
        orderId: request.orderId,
        gatewayOrderId: qr.gatewayOrderId,
        status: "pending",
        amount: request.amount,
        currency: "IDR",
        qrisString: qr.qrisString,
        ...(qr.qrImageUrl ? { qrImageUrl: qr.qrImageUrl, paymentUrl: qr.qrImageUrl } : {}),
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

    throw new Error(`Duitku ${request.method} direct payment is not supported by this adapter yet.`);
  }

  private async createVirtualAccountPayment(
    request: CreateVirtualAccountPaymentRequest,
    config: DuitkuConfig,
  ): Promise<VirtualAccountPaymentResult> {
    const paymentMethod = DUITKU_VA_BANK_METHODS[request.bank];
    const data = await this.createInquiry(request, paymentMethod, config);
    const statusCode = String(data.statusCode ?? "");
    if (statusCode !== "00") {
      throw createProviderError(
        `Duitku inquiry gagal [${statusCode}]: ${sanitizeProviderMessage(data.statusMessage)}`,
        data,
      );
    }

    const vaNumber = compactPaymentCode(data.vaNumber ?? data.paymentCode);
    if (!vaNumber) throw new Error("Duitku response tidak mengandung vaNumber");

    return {
      provider: "duitku",
      method: "virtual_account",
      orderId: request.orderId,
      gatewayOrderId: request.orderId,
      ...(typeof data.reference === "string" ? { gatewayTransactionId: data.reference } : {}),
      status: "pending",
      amount: request.amount,
      currency: "IDR",
      bank: request.bank,
      vaNumber,
      ...(typeof data.paymentUrl === "string" ? { paymentUrl: data.paymentUrl } : {}),
      raw: data,
    };
  }

  private async createEwalletPayment(
    request: CreateEwalletPaymentRequest,
    config: DuitkuConfig,
  ): Promise<EwalletPaymentResult> {
    const paymentMethod = DUITKU_EWALLET_METHODS[request.channel];
    if (!paymentMethod) {
      throw new Error(`Duitku ${request.channel} e-wallet direct payment is not supported by this adapter yet.`);
    }

    const data = await this.createInquiry(request, paymentMethod, config);
    const statusCode = String(data.statusCode ?? "");
    if (statusCode !== "00") {
      throw createProviderError(
        `Duitku inquiry gagal [${statusCode}]: ${sanitizeProviderMessage(data.statusMessage)}`,
        data,
      );
    }

    const paymentUrl = typeof data.appUrl === "string"
      ? data.appUrl
      : typeof data.paymentUrl === "string"
        ? data.paymentUrl
        : undefined;
    if (!paymentUrl) throw new Error("Duitku response tidak mengandung paymentUrl atau appUrl");

    return {
      provider: "duitku",
      method: "ewallet",
      orderId: request.orderId,
      gatewayOrderId: request.orderId,
      ...(typeof data.reference === "string" ? { gatewayTransactionId: data.reference } : {}),
      status: "pending",
      amount: request.amount,
      currency: "IDR",
      channel: request.channel,
      paymentUrl,
      deeplinkUrl: paymentUrl,
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
      provider: "duitku",
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
    if (merchantCode !== config.merchantCode) return false;

    const amount = String(payload.amount ?? "");
    const merchantOrderId = String(payload.merchantOrderId ?? "");
    const expected = hmacSha256(config.merchantCode + amount + merchantOrderId, config.merchantKey);
    const providedSignature = String(payload.signature ?? "");
    return constantTimeEqual(providedSignature, expected);
  }

  parseWebhook(
    payload: unknown,
    config: DuitkuConfig,
    _headers?: Record<string, string | string[] | undefined>,
    options: WebhookParseOptions = {},
  ): WebhookResult {
    if (payload === null || typeof payload !== "object") {
      if (options.throwOnInvalid === false) return invalidWebhookResult(payload);
      throw new Error("Duitku webhook payload must be an object");
    }

    const raw = payload as Record<string, unknown>;
    const valid = this.verifyWebhook(raw, config);
    if (!valid) {
      if (options.throwOnInvalid === false) return invalidWebhookResult(payload);
      throw new Error("Duitku webhook verification failed");
    }

    const statusCode = String(raw.resultCode ?? raw.statusCode ?? "01");
    const amount = parseAmount(raw.amount);
    const paymentCode = typeof raw.paymentCode === "string" ? raw.paymentCode : undefined;
    const bank = normalizeDuitkuVaBank(paymentCode);
    const channel = normalizeDuitkuEwalletChannel(paymentCode);
    const isQris = Boolean(raw.issuerCode) || ["SP", "NQ", "GQ", "SQ"].includes(paymentCode ?? "");
    const vaNumber = bank ? compactPaymentCode(raw.vaNumber ?? raw.paymentNumber) : undefined;

    const providerMeta: Record<string, unknown> = {};
    if (typeof raw.reference === "string") providerMeta.reference = raw.reference;
    if (typeof raw.paymentCode === "string") providerMeta.paymentCode = raw.paymentCode;
    if (typeof raw.publisherOrderId === "string") providerMeta.publisherOrderId = raw.publisherOrderId;
    if (typeof raw.issuerCode === "string") providerMeta.issuerCode = raw.issuerCode;
    if (typeof raw.settlementDate === "string") providerMeta.settlementDate = raw.settlementDate;

    return {
      valid: true,
      orderId: String(raw.merchantOrderId ?? ""),
      status: CALLBACK_STATUS_MAP[statusCode] ?? "pending",
      ...(amount !== undefined ? { amount } : {}),
      provider: "duitku",
      ...(typeof raw.reference === "string" ? { gatewayTransactionId: raw.reference } : {}),
      ...(bank
        ? { method: "virtual_account" as const, bank }
        : channel
          ? { method: "ewallet" as const, channel }
          : isQris
            ? { method: "qris" as const }
            : {}),
      ...(vaNumber ? { vaNumber } : {}),
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
