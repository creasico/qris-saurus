// Core exports
export * from "./core/crc";
export * from "./core/parser";
export * from "./core/serializer";
export * from "./core/types";
export * from "./core/validator";

// Provider exports (adapters under 'Adapter' namespace)
export * from "./providers/adapters/doku";
export * from "./providers/adapters/duitku";
export * from "./providers/adapters/midtrans";
export * from "./providers/adapters/poller";
export * from "./providers/adapters/token-manager";
export * from "./providers/adapters/xendit";
export * from "./providers/base";
export * from "./providers/registry";

// Adapter interface — implement this to add custom providers
export type { GatewayAdapter } from "./providers/adapters/adapter";

// Explicitly import and re-export types to avoid collisions
export type * from "./providers/adapters/types";

// Gateway exports
export { Gateway, gateway } from "./gateway/index";
export { ConfigurationError, GatewayError, ProviderCapabilityError } from "./gateway/errors";
export type {
  ChargeOptions,
  GatewayChargeResult,
  GatewayCheckoutResult,
  GatewayConfig,
  GatewayCreateCheckoutRequest,
  GatewayCreateEwalletRequest,
  GatewayCreatePaymentRequest,
  GatewayCreateQrisPaymentRequest,
  GatewayCreateVirtualAccountRequest,
  GatewayDynamicOptions,
  GatewayEwalletPaymentResult,
  GatewayPaymentResult,
  GatewayProvider,
  GatewayProviderCapabilities,
  GatewayQrisPaymentResult,
  GatewayStatusResult,
  GatewayVirtualAccountPaymentResult,
  GatewayWebhookResult,
} from "./gateway/types";

// Render and transform exports
export * from "./render";
export * from "./transform/static-to-dynamic";

