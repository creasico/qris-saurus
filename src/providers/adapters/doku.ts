import { createHash, createHmac, createSign, randomBytes, timingSafeEqual } from "node:crypto";
import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
import type { GatewayAdapter } from "./adapter";
import { pollUntilSettled, type PollOptions } from "./poller";
import { tokenManager } from "./token-manager";
import type {
  ApiQrCreateOptions,
  ApiQrResult,
  CreatePaymentRequest,
  CreateVirtualAccountPaymentRequest,
  DokuConfig,
  PaymentResult,
  ProviderCapabilities,
  VirtualAccountBank,
  VirtualAccountPaymentResult,
  WebhookParseOptions,
  WebhookRawBody,
  WebhookResult,
} from "./types";

const DEFAULT_CHANNEL_ID = "H2H";
const DEFAULT_SERVICE_CODE = "47";
const DEFAULT_VA_TRX_TYPE = "C";
const DEFAULT_FETCH_TIMEOUT_MS = 30000;
const DOKU_VA_BANK_CHANNELS: Record<VirtualAccountBank, string> = {
  bca: "VIRTUAL_ACCOUNT_BCA",
  bni: "VIRTUAL_ACCOUNT_BNI",
  bri: "VIRTUAL_ACCOUNT_BRI",
  mandiri: "VIRTUAL_ACCOUNT_MANDIRI",
  permata: "VIRTUAL_ACCOUNT_PERMATA",
  cimb: "VIRTUAL_ACCOUNT_CIMB",
};
const DOKU_CAPABILITIES: ProviderCapabilities = {
  qris: true,
  virtualAccount: { banks: ["bca", "bni", "bri", "mandiri", "permata", "cimb"] },
};
const DEFAULT_WEBHOOK_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const MAX_PROVIDER_ERROR_MESSAGE_LENGTH = 160;

const STATUS_MAP: Record<string, PaymentStatusCode> = {
  "00": "paid",
  "01": "pending",
  "02": "pending",
  "03": "pending",
  "04": "refunded",
  "05": "cancelled",
  "06": "failed",
  "07": "failed",
};

interface DokuTokenResponse {
  responseCode?: string;
  responseMessage?: string;
  accessToken?: string;
  tokenType?: string;
  expiresIn?: number | string;
  [key: string]: unknown;
}

interface DokuQrGenerateResponse {
  responseCode?: string;
  responseMessage?: string;
  referenceNo?: string;
  partnerReferenceNo?: string;
  qrContent?: string;
  terminalId?: string;
  additionalInfo?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DokuQrQueryResponse {
  responseCode?: string;
  responseMessage?: string;
  originalReferenceNo?: string;
  originalPartnerReferenceNo?: string;
  serviceCode?: string;
  latestTransactionStatus?: string;
  transactionStatusDesc?: string;
  paidTime?: string;
  amount?: {
    value?: number | string;
    currency?: string;
  };
  additionalInfo?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DokuAmountObject {
  value?: number | string;
  currency?: string;
}

interface DokuVirtualAccountData {
  partnerServiceId?: string;
  customerNo?: string | number;
  virtualAccountNo?: string;
  virtualAccountName?: string;
  virtualAccountEmail?: string;
  virtualAccountPhone?: string;
  trxId?: string;
  totalAmount?: DokuAmountObject;
  paidAmount?: DokuAmountObject;
  virtualAccountTrxType?: string;
  expiredDate?: string;
  paymentRequestId?: string;
  inquiryRequestId?: string;
  paymentFlagReason?: { english?: string; indonesia?: string };
  additionalInfo?: Record<string, unknown>;
  [key: string]: unknown;
}

interface DokuVirtualAccountResponse {
  responseCode?: string;
  responseMessage?: string;
  virtualAccountData?: DokuVirtualAccountData;
  additionalInfo?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DokuVirtualAccountStatusParams {
  partnerServiceId: string;
  customerNo: string;
  virtualAccountNo: string;
  inquiryRequestId?: string;
  paymentRequestId?: string;
}

function base64Sha256(input: string): string {
  return createHash("sha256").update(input).digest("base64");
}

function hexSha256(input: string): string {
  return createHash("sha256").update(input).digest("hex").toLowerCase();
}

function hmacSha512Base64(secret: string, input: string): string {
  return createHmac("sha512", secret).update(input).digest("base64");
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

function minifyJson(value: unknown): string {
  return JSON.stringify(value) ?? "";
}

function bodyToString(body: WebhookRawBody | undefined, fallback: unknown): string {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString("utf8");
  return minifyJson(fallback);
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

function timestamp(): string {
  return new Date().toISOString();
}

function randomExternalId(): string {
  return `${Date.now()}${randomBytes(10).toString("hex")}`.slice(0, 32);
}

function isTimestampWithinSkew(timestampHeader: string, maxSkewMs: number, now = new Date()): boolean {
  if (!Number.isFinite(maxSkewMs) || maxSkewMs < 0) return false;
  const parsed = Date.parse(timestampHeader);
  if (Number.isNaN(parsed)) return false;
  return Math.abs(now.getTime() - parsed) <= maxSkewMs;
}

function invalidWebhookResult(raw: unknown): WebhookResult {
  return { valid: false, orderId: "", status: "pending", raw };
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

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function compactPaymentCode(value: unknown): string | undefined {
  const str = typeof value === "number" ? String(value) : trimString(value);
  return str?.replace(/\s+/g, "");
}

function formatDokuAmount(amount: number): string {
  return amount.toFixed(2);
}

function formatPartnerServiceId(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 8) {
    throw new Error("DOKU virtualAccountPartnerServiceId must be 1-8 characters.");
  }
  return trimmed.padStart(8, " ");
}

function normalizeDokuVaBank(channel: unknown): VirtualAccountBank | undefined {
  const value = trimString(channel)?.toUpperCase();
  if (!value) return undefined;
  const match = Object.entries(DOKU_VA_BANK_CHANNELS).find(([, dokuChannel]) => dokuChannel === value);
  return match?.[0] as VirtualAccountBank | undefined;
}

function getDokuVaChannel(additionalInfo: unknown): string | undefined {
  if (!additionalInfo || typeof additionalInfo !== "object") return undefined;
  return trimString((additionalInfo as Record<string, unknown>).channel);
}

function createCustomerNo(request: CreateVirtualAccountPaymentRequest, partnerServiceId: string): string {
  if (!request.vaNumber) return "0";
  const compactPartnerServiceId = partnerServiceId.trim();
  const compactVaNumber = request.vaNumber.replace(/\s+/g, "");
  if (!compactVaNumber.startsWith(compactPartnerServiceId)) return compactVaNumber;
  const customerNo = compactVaNumber.slice(compactPartnerServiceId.length);
  return customerNo.length > 0 ? customerNo : "0";
}

function getVaAdditionalInfo(data: DokuVirtualAccountResponse | DokuVirtualAccountData): Record<string, unknown> | undefined {
  if (data.additionalInfo && typeof data.additionalInfo === "object") return data.additionalInfo;
  if ("virtualAccountData" in data) {
    const vaData = (data as DokuVirtualAccountResponse).virtualAccountData as DokuVirtualAccountData | undefined;
    const nested = vaData?.additionalInfo;
    if (nested && typeof nested === "object") return nested;
  }
  return undefined;
}

function responseCodeOk(code: unknown): boolean {
  return typeof code === "string" && code.startsWith("200");
}

export class DokuAdapter implements GatewayAdapter {
  capabilities(): ProviderCapabilities {
    return DOKU_CAPABILITIES;
  }

  private baseUrl(sandbox = false): string {
    return sandbox ? "https://api-sandbox.doku.com" : "https://api.doku.com";
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const contentType = response.headers.get("content-type") ?? "";

      if (!contentType.includes("application/json")) {
        await response.text();
        throw new Error(
          `DOKU error [${response.status}]: ${sanitizeProviderMessage(response.statusText)}`,
        );
      }

      const data = (await response.json()) as T & Record<string, unknown>;

      if (!response.ok || !responseCodeOk(data.responseCode)) {
        const msg = sanitizeProviderMessage(data.responseMessage ?? data.message ?? response.statusText);
        throw createProviderError(`DOKU error [${response.status}]: ${msg}`, data);
      }

      return data;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`DOKU request timeout (${DEFAULT_FETCH_TIMEOUT_MS}ms)`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private signTokenRequest(clientId: string, privateKey: string, requestTimestamp: string): string {
    const signer = createSign("RSA-SHA256");
    signer.update(`${clientId}|${requestTimestamp}`);
    signer.end();
    return signer.sign(normalizePrivateKey(privateKey), "base64");
  }

  private signSnapRequest(
    method: string,
    path: string,
    accessToken: string,
    body: unknown,
    requestTimestamp: string,
    clientSecret: string,
  ): string {
    const digest = hexSha256(minifyJson(body));
    const stringToSign = `${method}:${path}:${accessToken}:${digest}:${requestTimestamp}`;
    return hmacSha512Base64(clientSecret, stringToSign);
  }

  private async getAccessToken(config: DokuConfig): Promise<string> {
    const cacheKey = `doku:${config.sandbox ? "sandbox" : "production"}:${config.clientId}`;
    return tokenManager.getToken(cacheKey, async () => {
      const requestTimestamp = timestamp();
      const signature = this.signTokenRequest(config.clientId, config.privateKey, requestTimestamp);
      const data = await this.request<DokuTokenResponse>(
        `${this.baseUrl(config.sandbox)}/authorization/v1/access-token/b2b`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-CLIENT-KEY": config.clientId,
            "X-TIMESTAMP": requestTimestamp,
            "X-SIGNATURE": signature,
          },
          body: JSON.stringify({ grantType: "client_credentials" }),
        },
      );

      if (typeof data.accessToken !== "string" || data.accessToken.length === 0) {
        throw new Error("DOKU token response tidak mengandung accessToken");
      }

      return {
        accessToken: data.accessToken,
        expiresInSeconds: Number(data.expiresIn ?? 900),
      };
    });
  }

  private async snapRequest<T>(path: string, body: unknown, config: DokuConfig): Promise<T> {
    const accessToken = await this.getAccessToken(config);
    const requestTimestamp = timestamp();
    const signature = this.signSnapRequest(
      "POST",
      path,
      accessToken,
      body,
      requestTimestamp,
      config.clientSecret,
    );

    return this.request<T>(`${this.baseUrl(config.sandbox)}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-PARTNER-ID": config.clientId,
        "X-EXTERNAL-ID": randomExternalId(),
        "X-TIMESTAMP": requestTimestamp,
        "X-SIGNATURE": signature,
        Authorization: `Bearer ${accessToken}`,
        "CHANNEL-ID": config.channelId ?? DEFAULT_CHANNEL_ID,
      },
      body: JSON.stringify(body),
    });
  }

  async createDynamicQr(
    options: ApiQrCreateOptions,
    config: DokuConfig,
  ): Promise<ApiQrResult> {
    const path = "/snap-adapter/b2b/v1.0/qr/qr-mpm-generate";
    const body = {
      partnerReferenceNo: options.orderId,
      amount: {
        value: options.amount.toFixed(2),
        currency: "IDR",
      },
      merchantId: config.merchantId,
      terminalId: config.terminalId,
      ...(config.validityPeriod ? { validityPeriod: config.validityPeriod } : {}),
      additionalInfo: config.additionalInfo ?? {},
    };

    const data = await this.snapRequest<DokuQrGenerateResponse>(path, body, config);
    const qrisString = typeof data.qrContent === "string" ? data.qrContent : null;
    if (!qrisString) {
      throw new Error("DOKU response tidak mengandung qrContent");
    }

    return {
      qrisString,
      gatewayOrderId: String(data.partnerReferenceNo ?? options.orderId),
      ...(typeof data.referenceNo === "string" ? { gatewayTransactionId: data.referenceNo } : {}),
      raw: data,
    };
  }

  async createPayment(request: CreatePaymentRequest, config: DokuConfig): Promise<PaymentResult> {
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
        provider: "doku",
        method: "qris",
        orderId: request.orderId,
        gatewayOrderId: qr.gatewayOrderId,
        status: "pending",
        amount: request.amount,
        currency: "IDR",
        qrisString: qr.qrisString,
        ...(qr.gatewayTransactionId ? { gatewayTransactionId: qr.gatewayTransactionId } : {}),
        raw: qr.raw,
      };
    }

    if (request.method === "virtual_account") {
      return this.createVirtualAccountPayment(request, config);
    }

    throw new Error(`DOKU ${request.method} direct payment is not supported by this adapter yet.`);
  }

  private async createVirtualAccountPayment(
    request: CreateVirtualAccountPaymentRequest,
    config: DokuConfig,
  ): Promise<VirtualAccountPaymentResult> {
    const partnerServiceId = config.virtualAccountPartnerServiceId;
    if (!partnerServiceId) {
      throw new Error("DOKU virtual_account payments require virtualAccountPartnerServiceId in config.");
    }

    const formattedPartnerServiceId = formatPartnerServiceId(partnerServiceId);
    const customerNo = createCustomerNo(request, formattedPartnerServiceId);
    const channel = DOKU_VA_BANK_CHANNELS[request.bank];
    const virtualAccountNo = request.vaNumber ?? `${formattedPartnerServiceId}${customerNo}`;
    const virtualAccountConfig = {
      ...(config.virtualAccountReusableStatus !== undefined
        ? { reusableStatus: config.virtualAccountReusableStatus }
        : {}),
    };
    const body = {
      partnerServiceId: formattedPartnerServiceId,
      customerNo,
      virtualAccountNo,
      virtualAccountName: request.customerName ?? request.customerEmail ?? request.orderId,
      ...(request.customerEmail ? { virtualAccountEmail: request.customerEmail } : {}),
      ...(request.customerPhone ? { virtualAccountPhone: request.customerPhone } : {}),
      trxId: request.orderId,
      totalAmount: {
        value: formatDokuAmount(request.amount),
        currency: request.currency ?? "IDR",
      },
      additionalInfo: {
        channel,
        ...(Object.keys(virtualAccountConfig).length > 0 ? { virtualAccountConfig } : {}),
      },
      virtualAccountTrxType: DEFAULT_VA_TRX_TYPE,
      ...(request.expiresAt ? { expiredDate: request.expiresAt.toISOString() } : {}),
    };

    const data = await this.snapRequest<DokuVirtualAccountResponse>(
      "/virtual-accounts/bi-snap-va/v1.1/transfer-va/create-va",
      body,
      config,
    );
    const vaData = data.virtualAccountData;
    const vaNumber = compactPaymentCode(vaData?.virtualAccountNo ?? virtualAccountNo);
    if (!vaNumber) throw new Error("DOKU response tidak mengandung virtualAccountNo");

    const responseAdditionalInfo = getVaAdditionalInfo(data);
    const paymentUrl = trimString(responseAdditionalInfo?.howToPayPage);
    const expiresAt = trimString(vaData?.expiredDate ?? body.expiredDate);

    return {
      provider: "doku",
      method: "virtual_account",
      orderId: request.orderId,
      gatewayOrderId: String(vaData?.trxId ?? request.orderId),
      status: "pending",
      amount: request.amount,
      currency: "IDR",
      bank: request.bank,
      vaNumber,
      ...(paymentUrl ? { paymentUrl } : {}),
      ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}),
      raw: data,
    };
  }

  async checkPaymentStatus(orderId: string, config: DokuConfig): Promise<PaymentStatusResult> {
    const path = "/snap-adapter/b2b/v1.0/qr/qr-mpm-query";
    const data = await this.snapRequest<DokuQrQueryResponse>(
      path,
      {
        originalReferenceNo: orderId,
        originalPartnerReferenceNo: orderId,
        merchantId: config.merchantId,
        serviceCode: config.serviceCode ?? DEFAULT_SERVICE_CODE,
      },
      config,
    );

    const statusCode = String(data.latestTransactionStatus ?? "03");
    const status = STATUS_MAP[statusCode] ?? "pending";
    const amount = parseAmount(data.amount?.value);
    const paidAt = status === "paid" && typeof data.paidTime === "string"
      ? new Date(data.paidTime)
      : undefined;

    return {
      orderId: String(data.originalPartnerReferenceNo ?? orderId),
      status,
      ...(amount !== undefined ? { amount } : {}),
      ...(paidAt !== undefined ? { paidAt } : {}),
      provider: "doku",
      ...(typeof data.originalReferenceNo === "string" ? { gatewayTransactionId: data.originalReferenceNo } : {}),
      method: "qris",
      raw: data,
    };
  }

  async checkVirtualAccountStatus(
    params: DokuVirtualAccountStatusParams,
    config: DokuConfig,
  ): Promise<PaymentStatusResult> {
    const partnerServiceId = formatPartnerServiceId(params.partnerServiceId);
    const body = {
      partnerServiceId,
      customerNo: params.customerNo,
      virtualAccountNo: params.virtualAccountNo,
      ...(params.inquiryRequestId ? { inquiryRequestId: params.inquiryRequestId } : {}),
      ...(params.paymentRequestId ? { paymentRequestId: params.paymentRequestId } : {}),
      additionalInfo: {},
    };
    const data = await this.snapRequest<DokuVirtualAccountResponse>(
      "/orders/v1.0/transfer-va/status",
      body,
      config,
    );
    const vaData = data.virtualAccountData;
    const additionalInfo = getVaAdditionalInfo(data);
    const channel = getDokuVaChannel(additionalInfo);
    const bank = normalizeDokuVaBank(channel);
    const paidAmount = parseAmount(vaData?.paidAmount?.value);
    const billAmount = parseAmount(vaData?.totalAmount?.value);
    const paymentReason = vaData?.paymentFlagReason?.english?.toLowerCase();
    const status: PaymentStatusCode = paidAmount !== undefined
      ? "paid"
      : paymentReason?.includes("pending")
        ? "pending"
        : "pending";
    const vaNumber = compactPaymentCode(vaData?.virtualAccountNo ?? params.virtualAccountNo);

    const result: PaymentStatusResult = {
      orderId: String(vaData?.trxId ?? data.additionalInfo?.trxId ?? params.virtualAccountNo),
      status,
      ...(paidAmount !== undefined ? { amount: paidAmount } : billAmount !== undefined ? { amount: billAmount } : {}),
      provider: "doku",
      method: "virtual_account",
      raw: data,
    };
    if (bank) result.bank = bank;
    if (vaNumber) result.vaNumber = vaNumber;
    return result;
  }

  verifyWebhook(
    payload: unknown,
    config: Pick<DokuConfig, "clientSecret" | "webhookMaxTimestampSkewMs" | "webhookPath">,
    headers: Record<string, string | string[] | undefined> = {},
    options: WebhookParseOptions = {},
  ): boolean {
    const signature = this.getHeader(headers, "x-signature");
    const timestampHeader = this.getHeader(headers, "x-timestamp");
    const authorization = this.getHeader(headers, "authorization");

    if (!signature || !timestampHeader || !authorization || !config.webhookPath) return false;

    const maxSkewMs = options.maxTimestampSkewMs
      ?? config.webhookMaxTimestampSkewMs
      ?? DEFAULT_WEBHOOK_TIMESTAMP_SKEW_MS;
    if (!isTimestampWithinSkew(timestampHeader, maxSkewMs, options.now)) return false;

    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return false;

    const stringToSign = [
      "POST",
      config.webhookPath,
      token,
      hexSha256(bodyToString(options.rawBody, payload)),
      timestampHeader,
    ].join(":");
    const expected = hmacSha512Base64(config.clientSecret, stringToSign);
    return constantTimeEqual(signature, expected) || constantTimeEqual(signature, `HMACSHA512=${expected}`);
  }

  parseWebhook(
    payload: unknown,
    config: DokuConfig,
    headers?: Record<string, string | string[] | undefined>,
    options: WebhookParseOptions = {},
  ): WebhookResult {
    if (payload === null || typeof payload !== "object") {
      if (options.throwOnInvalid === false) return invalidWebhookResult(payload);
      throw new Error("DOKU webhook payload must be an object");
    }

    const valid = this.verifyWebhook(payload, config, headers, options);
    if (!valid) {
      if (options.throwOnInvalid === false) return invalidWebhookResult(payload);
      throw new Error("DOKU webhook verification failed");
    }

    const raw = payload as Record<string, unknown>;
    const vaData = raw.virtualAccountData && typeof raw.virtualAccountData === "object"
      ? raw.virtualAccountData as DokuVirtualAccountData
      : undefined;
    const rawAdditionalInfo = raw.additionalInfo && typeof raw.additionalInfo === "object"
      ? raw.additionalInfo as Record<string, unknown>
      : undefined;
    const additionalInfo = vaData
      ? getVaAdditionalInfo(rawAdditionalInfo ? { virtualAccountData: vaData, additionalInfo: rawAdditionalInfo } : vaData)
      : rawAdditionalInfo;
    const statusCode = String(raw.latestTransactionStatus ?? raw.transactionStatus ?? (vaData ? "00" : "03"));
    const status = STATUS_MAP[statusCode] ?? "pending";
    const amountObject = (vaData?.paidAmount ?? raw.amount) as { value?: unknown } | undefined;
    const amount = parseAmount(amountObject?.value);
    const paidAt = status === "paid" && typeof (raw.paidTime ?? vaData?.trxDateTime) === "string"
      ? new Date(String(raw.paidTime ?? vaData?.trxDateTime))
      : undefined;
    const channel = getDokuVaChannel(additionalInfo);
    const bank = normalizeDokuVaBank(channel);
    const vaNumber = compactPaymentCode(vaData?.virtualAccountNo);

    const providerMeta: Record<string, unknown> = {};
    if (typeof raw.originalReferenceNo === "string") providerMeta.referenceNo = raw.originalReferenceNo;
    if (typeof raw.transactionStatusDesc === "string") providerMeta.transactionStatusDesc = raw.transactionStatusDesc;
    if (typeof vaData?.paymentRequestId === "string") providerMeta.paymentRequestId = vaData.paymentRequestId;
    if (channel) providerMeta.channel = channel;
    if (additionalInfo && typeof additionalInfo === "object") providerMeta.additionalInfo = additionalInfo;

    return {
      valid: true,
      orderId: String(vaData?.trxId ?? raw.originalPartnerReferenceNo ?? raw.partnerReferenceNo ?? ""),
      status,
      ...(amount !== undefined ? { amount } : {}),
      ...(paidAt !== undefined ? { paidAt } : {}),
      provider: "doku",
      ...(typeof raw.originalReferenceNo === "string" ? { gatewayTransactionId: raw.originalReferenceNo } : {}),
      ...(vaData ? { method: "virtual_account" as const } : { method: "qris" as const }),
      ...(bank ? { bank } : {}),
      ...(vaNumber ? { vaNumber } : {}),
      ...(Object.keys(providerMeta).length > 0 ? { providerMeta } : {}),
      raw: payload,
    };
  }

  async pollPaymentStatus(
    orderId: string,
    config: DokuConfig,
    options?: PollOptions,
  ): Promise<PaymentStatusResult> {
    return pollUntilSettled(() => this.checkPaymentStatus(orderId, config), options);
  }

  private getHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string {
    const key = Object.keys(headers).find((item) => item.toLowerCase() === name);
    const value = key ? headers[key] : undefined;
    return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
  }

  /** Exposed for tests and custom integrations that need DOKU-compatible Digest headers. */
  createDigest(body: unknown): string {
    return `SHA-256=${base64Sha256(minifyJson(body))}`;
  }
}

export const dokuAdapter = new DokuAdapter();
