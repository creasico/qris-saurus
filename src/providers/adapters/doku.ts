import { createHash, createHmac, createSign, timingSafeEqual } from "node:crypto";
import type { PaymentStatusCode, PaymentStatusResult } from "../../core/types";
import type { GatewayAdapter } from "./adapter";
import { pollUntilSettled, type PollOptions } from "./poller";
import { tokenManager } from "./token-manager";
import type { ApiQrCreateOptions, ApiQrResult, DokuConfig, WebhookResult } from "./types";

const DEFAULT_CHANNEL_ID = "H2H";
const DEFAULT_SERVICE_CODE = "47";
const DEFAULT_FETCH_TIMEOUT_MS = 30000;

const STATUS_MAP: Record<string, PaymentStatusCode> = {
  "00": "paid",
  "03": "pending",
  "04": "refunded",
  "05": "cancelled",
  "06": "failed",
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

function timestamp(): string {
  return new Date().toISOString();
}

function randomExternalId(): string {
  const timePart = Date.now().toString();
  const randomPart = Math.floor(Math.random() * 1_000_000_000).toString().padStart(9, "0");
  return `${timePart}${randomPart}`.slice(0, 32);
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

function responseCodeOk(code: unknown): boolean {
  return typeof code === "string" && code.startsWith("200");
}

export class DokuAdapter implements GatewayAdapter {
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
        const text = await response.text();
        throw new Error(`DOKU error [${response.status}]: ${text || response.statusText}`);
      }

      const data = (await response.json()) as T & Record<string, unknown>;

      if (!response.ok || !responseCodeOk(data.responseCode)) {
        const msg = data.responseMessage ?? data.message ?? response.statusText;
        throw new Error(`DOKU error [${response.status}]: ${msg}`);
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
      raw: data,
    };
  }

  verifyWebhook(
    payload: unknown,
    config: Pick<DokuConfig, "clientSecret" | "webhookPath">,
    headers: Record<string, string | string[] | undefined> = {},
  ): boolean {
    const signature = this.getHeader(headers, "x-signature");
    const timestampHeader = this.getHeader(headers, "x-timestamp");
    const authorization = this.getHeader(headers, "authorization");

    if (!signature || !timestampHeader || !authorization || !config.webhookPath) return false;

    const token = authorization.replace(/^Bearer\s+/i, "");
    const stringToSign = [
      "POST",
      config.webhookPath,
      token,
      hexSha256(minifyJson(payload)),
      timestampHeader,
    ].join(":");
    const expected = hmacSha512Base64(config.clientSecret, stringToSign);
    return constantTimeEqual(signature, expected) || constantTimeEqual(signature, `HMACSHA512=${expected}`);
  }

  parseWebhook(
    payload: unknown,
    config: DokuConfig,
    headers?: Record<string, string | string[] | undefined>,
  ): WebhookResult {
    if (payload === null || typeof payload !== "object") {
      return { valid: false, orderId: "", status: "pending", raw: payload };
    }

    const raw = payload as Record<string, unknown>;
    const statusCode = String(raw.latestTransactionStatus ?? raw.transactionStatus ?? "03");
    const status = STATUS_MAP[statusCode] ?? "pending";
    const amountObject = raw.amount as { value?: unknown } | undefined;
    const amount = parseAmount(amountObject?.value);
    const paidAt = status === "paid" && typeof raw.paidTime === "string"
      ? new Date(raw.paidTime)
      : undefined;

    const providerMeta: Record<string, unknown> = {};
    if (typeof raw.originalReferenceNo === "string") providerMeta.referenceNo = raw.originalReferenceNo;
    if (typeof raw.transactionStatusDesc === "string") providerMeta.transactionStatusDesc = raw.transactionStatusDesc;
    if (raw.additionalInfo && typeof raw.additionalInfo === "object") providerMeta.additionalInfo = raw.additionalInfo;

    return {
      valid: this.verifyWebhook(payload, config, headers),
      orderId: String(raw.originalPartnerReferenceNo ?? raw.partnerReferenceNo ?? ""),
      status,
      ...(amount !== undefined ? { amount } : {}),
      ...(paidAt !== undefined ? { paidAt } : {}),
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
