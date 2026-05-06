import type { DynamicOptions } from "../../core/types";

export interface MidtransConfig {
  serverKey: string;
  /** Gunakan sandbox endpoint. Default: false */
  sandbox?: boolean;
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
  raw: unknown;
}
