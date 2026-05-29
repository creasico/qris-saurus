import type { DynamicOptions, PaymentStatusResult } from "../core/types";

import type {
  ApiQrResult,
  CheckoutResult,
  CreateCheckoutRequest,
  CreateEwalletPaymentRequest,
  CreatePaymentRequest,
  CreateQrisPaymentRequest,
  CreateVirtualAccountPaymentRequest,
  DokuConfig,
  DuitkuConfig,
  EwalletPaymentResult,
  MidtransConfig,
  PaymentResult,
  QrisPaymentResult,
  ProviderCapabilities,
  VirtualAccountPaymentResult,
  WebhookResult,
  XenditConfig,
} from "../providers/adapters/types";

export type GatewayProvider = "midtrans" | "xendit" | "duitku" | "doku";

export type GatewayConfig =
  | ({ provider: "midtrans" } & MidtransConfig)
  | ({ provider: "xendit" } & XenditConfig)
  | ({ provider: "duitku" } & DuitkuConfig)
  | ({ provider: "doku" } & DokuConfig)
  | ({ provider: string } & Record<string, any>);

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
export type GatewayCreatePaymentRequest = CreatePaymentRequest;
export type GatewayCreateQrisPaymentRequest = Omit<CreateQrisPaymentRequest, "method">;
export type GatewayCreateVirtualAccountRequest = Omit<CreateVirtualAccountPaymentRequest, "method">;
export type GatewayCreateEwalletRequest = Omit<CreateEwalletPaymentRequest, "method">;
export type GatewayPaymentResult = PaymentResult;
export type GatewayQrisPaymentResult = QrisPaymentResult;
export type GatewayVirtualAccountPaymentResult = VirtualAccountPaymentResult;
export type GatewayEwalletPaymentResult = EwalletPaymentResult;
export type GatewayCreateCheckoutRequest = CreateCheckoutRequest;
export type GatewayCheckoutResult = CheckoutResult;
export type GatewayProviderCapabilities = ProviderCapabilities;

export interface GatewayStatusResult extends PaymentStatusResult {}

export type GatewayWebhookResult = WebhookResult;

export type GatewayDynamicOptions = Omit<DynamicOptions, "amount">;
