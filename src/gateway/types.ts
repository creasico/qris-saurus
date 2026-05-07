import type { DynamicOptions, PaymentStatusResult } from "../core/types";
import type { PollOptions } from "../providers/adapters/poller";
import type {
  ApiQrResult,
  DuitkuConfig,
  MidtransConfig,
  RefundOptions,
  WebhookResult,
  XenditConfig,
} from "../providers/adapters/types";

export type GatewayProvider = "midtrans" | "xendit" | "duitku";

export type GatewayConfig =
  | ({ provider: "midtrans" } & MidtransConfig)
  | ({ provider: "xendit" } & XenditConfig)
  | ({ provider: "duitku" } & DuitkuConfig);

export interface ChargeOptions {
  description?: string;
  customerEmail?: string;
  /** Override webhook notification URL for this transaction. */
  notificationUrl?: string;
  /** Duitku: redirect URL after payment. Uses config default if omitted. */
  returnUrl?: string;
  /** Duitku: callback URL for payment notification. Uses config default if omitted. */
  callbackUrl?: string;
}

export type GatewayChargeResult = ApiQrResult;

export interface GatewayStatusResult extends PaymentStatusResult {}

export type GatewayWebhookResult = WebhookResult;

export type { PollOptions, RefundOptions, WebhookResult };
export type GatewayDynamicOptions = Omit<DynamicOptions, "amount">;
