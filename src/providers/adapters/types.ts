import type { DynamicOptions, PaymentStatusCode, PaymentStatusResult } from "../../core/types";

export interface MidtransConfig {
  serverKey: string;
  /** Gunakan sandbox endpoint. Default: false */
  sandbox?: boolean;
}

export interface MidtransNotificationOptions {
  /** Override webhook URL untuk transaksi ini. */
  overrideNotificationUrl?: string;
  /** Tambahkan webhook URL tambahan untuk transaksi ini. */
  appendNotificationUrls?: string[];
}

export interface XenditConfig {
  secretKey: string;
  /** Callback verification token from Xendit dashboard. If omitted, webhook verification will return valid: false. */
  callbackToken?: string;
}

export interface DokuConfig {
  /** DOKU Client ID / X-PARTNER-ID. */
  clientId: string;
  /** DOKU Secret Key used for SNAP symmetric signatures. */
  clientSecret: string;
  /** Merchant private key used to sign B2B token requests. */
  privateKey: string;
  /** DOKU merchant ID / mall ID for QRIS. */
  merchantId: string;
  /** QRIS terminal ID registered in DOKU. */
  terminalId: string;
  /** Gunakan sandbox endpoint. Default: false */
  sandbox?: boolean;
  /** SNAP channel ID for QRIS. Default: H2H */
  channelId?: string;
  /** QRIS status service code. Default: 47 */
  serviceCode?: string;
  /** Optional QRIS expiry time in ISO 8601 format. */
  validityPeriod?: string;
  /** Additional QRIS metadata, e.g. postalCode and feeType. */
  additionalInfo?: Record<string, unknown>;
  /** Merchant webhook path used to verify DOKU notifications, e.g. /webhooks/doku. */
  webhookPath?: string;
}

export interface DuitkuConfig {
  merchantCode: string;
  /** Duitku API key. Kept as merchantKey for backwards compatibility. */
  merchantKey: string;
  /** Gunakan sandbox endpoint. Default: false */
  sandbox?: boolean;
  /** URL redirect setelah pembayaran. Wajib untuk Duitku createInvoice. */
  returnUrl: string;
  /** URL callback notifikasi pembayaran dari Duitku. Wajib untuk Duitku createInvoice. */
  callbackUrl: string;
  /** Duitku QRIS payment method code. Common values: SP, NQ, GQ, SQ. Default: SP */
  paymentMethod?: string;
  customerVaName?: string;
  phoneNumber?: string;
  expiryPeriod?: number;
  additionalParam?: string;
  merchantUserInfo?: string;
}

export interface ApiQrCreateOptions extends DynamicOptions {
  /** Order ID unik per transaksi — wajib untuk gateway API */
  orderId: string;
  description?: string;
  customerEmail?: string;
  /**
   * Catatan: field dari DynamicOptions seperti `tipType`, `tipValue`,
   * `merchantRef`, dan `terminalLabel` tidak digunakan oleh gateway adapter.
   * Field-field tersebut hanya berlaku untuk transformasi lokal via `staticToDynamic()`.
   */
}

export interface ApiQrResult {
  qrisString: string;
  /** ID order di sisi gateway, digunakan untuk cek status */
  gatewayOrderId: string;
  expiresAt?: Date;
  /** URL PNG QR bila disediakan gateway. */
  qrImageUrl?: string;
  /** URL PNG QR alternatif, misalnya versi ASPI/bordered. */
  qrImageUrlV2?: string;
  /** ID transaksi di sisi gateway. */
  gatewayTransactionId?: string;
  /** Nama acquirer/provider dari gateway. */
  acquirer?: string;
  /** Payment type mentah dari gateway. */
  paymentType?: string;
  raw: unknown;
}

export interface MidtransAction {
  name?: string;
  method?: string;
  url?: string;
}

export interface MidtransChargeResponse {
  status_code?: string;
  status_message?: string;
  transaction_id?: string;
  order_id?: string;
  merchant_id?: string;
  gross_amount?: string;
  currency?: string;
  payment_type?: string;
  transaction_time?: string;
  transaction_status?: string;
  fraud_status?: string;
  acquirer?: string;
  qr_string?: string;
  expiry_time?: string;
  actions?: MidtransAction[];
  [key: string]: unknown;
}

export interface MidtransWebhookPayload {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  transaction_status?: string;
  transaction_id?: string;
  signature_key?: string;
  fraud_status?: string;
  settlement_time?: string;
  payment_type?: string;
  issuer?: string;
  acquirer?: string;
  [key: string]: unknown;
}

export interface MidtransWebhookParseResult extends PaymentStatusResult {
  valid: boolean;
  raw: MidtransWebhookPayload;
  fraudStatus?: string;
  transactionId?: string;
  paymentType?: string;
  acquirer?: string;
}

/**
 * Unified webhook result returned by all adapters' `parseWebhook()` method.
 * Provider-specific details are available via `providerMeta`.
 */
export interface WebhookResult extends PaymentStatusResult {
  /** Whether the webhook signature/token is valid. */
  valid: boolean;
  /** Provider-specific extras (e.g. fraudStatus, transactionId, acquirer). */
  providerMeta?: Record<string, unknown>;
}

export interface RefundOptions {
  /** Unik ID untuk permintaan refund ini */
  refundKey?: string;
  /** Jumlah yang akan direfund. Default: seluruh jumlah transaksi. */
  amount?: number;
  /** Alasan refund */
  reason?: string;
}
