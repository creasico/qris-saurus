export interface TlvNode {
  id: string;
  length: number;
  value: string;
  children?: TlvNode[];
}

export interface QrisData {
  raw: string;
  nodes: TlvNode[];
  crc: string;
}

export interface DynamicOptions {
  amount: number;
  tipType?: "none" | "fixed" | "percent";
  tipValue?: number;
  merchantRef?: string;
  terminalLabel?: string;
}

export interface DynamicResult {
  qrisString: string;
  source: "local" | "api";
  provider: string;
  amount: number;
  raw?: unknown;
}

export interface ProviderInfo {
  code: string;
  name: string;
  aliases: string[];
  merchantInfoTagIds: string[];
  identifiers: string[];
  supportsApiDynamic: boolean;
  notes?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export type PaymentStatusCode = "pending" | "paid" | "refunded" | "expired" | "failed" | "cancelled";

export interface PaymentStatusResult {
  orderId: string;
  status: PaymentStatusCode;
  amount?: number;
  paidAt?: Date;
  /** Provider name when the status is returned by a gateway adapter. */
  provider?: string;
  /** Provider transaction id when available. */
  gatewayTransactionId?: string;
  /** Normalized payment method when the provider includes it in status/webhook payloads. */
  method?: "qris" | "virtual_account" | "ewallet" | "payment_link";
  /** Virtual account bank when method is virtual_account. */
  bank?: "bca" | "bni" | "bri" | "mandiri" | "permata" | "cimb";
  /** E-wallet channel when method is ewallet. */
  channel?: "gopay" | "shopeepay" | "ovo" | "dana" | "linkaja";
  /** Virtual account number when available from status/webhook. */
  vaNumber?: string;
  /** Payment/deeplink URL when available from status/webhook. */
  paymentUrl?: string;
  raw: unknown;
}
