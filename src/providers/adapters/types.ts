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
}

export interface DuitkuConfig {
  merchantCode: string;
  merchantKey: string;
  /** Gunakan sandbox endpoint. Default: false */
  sandbox?: boolean;
  /** URL redirect setelah pembayaran. Wajib untuk Duitku createInvoice. */
  returnUrl: string;
  /** URL callback notifikasi pembayaran dari Duitku. Wajib untuk Duitku createInvoice. */
  callbackUrl: string;
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

export interface RefundOptions {
  /** Unik ID untuk permintaan refund ini */
  refundKey?: string;
  /** Jumlah yang akan direfund. Default: seluruh jumlah transaksi. */
  amount?: number;
  /** Alasan refund */
  reason?: string;
}
