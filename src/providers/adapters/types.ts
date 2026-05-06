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
}

export interface ApiQrCreateOptions extends DynamicOptions {
  /** Order ID unik per transaksi — wajib untuk gateway API */
  orderId: string;
  description?: string;
  customerEmail?: string;
}

export interface ApiQrResult {
  qrisString: string;
  /** ID order di sisi gateway, digunakan untuk cek status */
  gatewayOrderId: string;
  expiresAt?: Date;
  raw: unknown;
}
