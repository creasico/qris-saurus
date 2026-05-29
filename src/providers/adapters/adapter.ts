import type { PaymentStatusResult } from "../../core/types";
import type { PollOptions } from "./poller";
import type {
  ApiQrCreateOptions,
  ApiQrResult,
  CheckoutResult,
  CreateCheckoutRequest,
  CreatePaymentRequest,
  PaymentResult,
  ProviderCapabilities,
  WebhookParseOptions,
  WebhookResult,
} from "./types";

/**
 * Unified contract for all payment gateway adapters.
 *
 * Implementing this interface allows a provider to be used through the
 * `Gateway` class without any provider-specific branching — the gateway
 * delegates every call to the adapter.
 *
 * @example
 *   class MyProviderAdapter implements GatewayAdapter { ... }
 */
export interface GatewayAdapter {
  /** Declare provider capabilities so callers can choose supported payment flows safely. */
  capabilities?(): ProviderCapabilities;

  /** Create a normalized payment via the provider API. */
  createPayment?(
    request: CreatePaymentRequest,
    config: unknown,
    extra?: unknown,
  ): Promise<PaymentResult>;

  /** Create a provider-hosted checkout/payment page if supported. */
  createCheckout?(
    request: CreateCheckoutRequest,
    config: unknown,
    extra?: unknown,
  ): Promise<CheckoutResult>;

  /** Create a dynamic QRIS payment via the provider API. */
  createDynamicQr(
    options: ApiQrCreateOptions,
    config: unknown,
    extra?: unknown,
  ): Promise<ApiQrResult>;

  /** Check the current payment status for a given order. */
  checkPaymentStatus(
    orderId: string,
    config: unknown,
  ): Promise<PaymentStatusResult>;

  /** Poll payment status until a terminal state is reached or timeout elapses. */
  pollPaymentStatus(
    orderId: string,
    config: unknown,
    options?: PollOptions,
  ): Promise<PaymentStatusResult>;

  /**
   * Parse and verify an incoming webhook/callback from the provider.
   * Returns a normalised `WebhookResult` with a `valid` flag.
   *
   * @param payload  The raw webhook body (parsed JSON).
   * @param config   Provider configuration (used for signature verification).
   * @param headers  Optional HTTP headers (e.g. Xendit's `x-callback-token`).
   * @param options  Optional verification controls, such as rawBody for signed requests.
   */
  parseWebhook(
    payload: unknown,
    config: unknown,
    headers?: Record<string, string | string[] | undefined>,
    options?: WebhookParseOptions,
  ): WebhookResult;
}
