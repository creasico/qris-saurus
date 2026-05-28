import type { PaymentStatusResult } from "../core/types";
import { DokuAdapter } from "../providers/adapters/doku";
import { DuitkuAdapter } from "../providers/adapters/duitku";
import { MidtransAdapter } from "../providers/adapters/midtrans";
import type { PollOptions } from "../providers/adapters/poller";
import type {
  ApiQrCreateOptions,
  MidtransConfig,
  MidtransNotificationOptions,
  RefundOptions,
  WebhookResult,
} from "../providers/adapters/types";
import { XenditAdapter } from "../providers/adapters/xendit";
import type { GatewayAdapter } from "../providers/adapters/adapter";
import { staticToDynamic } from "../transform/static-to-dynamic";
import { ConfigurationError, ProviderCapabilityError } from "./errors";
import type {
  ChargeOptions,
  GatewayChargeResult,
  GatewayConfig,
  GatewayDynamicOptions,
  GatewayStatusResult,
} from "./types";

/** Built-in adapter factory for known providers. */
const BUILTIN_ADAPTERS: Record<string, () => GatewayAdapter> = {
  midtrans: () => new MidtransAdapter(),
  xendit: () => new XenditAdapter(),
  duitku: () => new DuitkuAdapter(),
  doku: () => new DokuAdapter(),
};

function createAdapter(provider: string, customAdapters: Map<string, () => GatewayAdapter>): GatewayAdapter {
  const factory = BUILTIN_ADAPTERS[provider] ?? customAdapters.get(provider);
  if (!factory) {
    throw new ConfigurationError(
      `Unknown provider: "${provider}". Register it first with Gateway.registerProvider().`,
    );
  }
  return factory();
}

function resolveConfig(config: GatewayConfig, customAdapters: Map<string, () => GatewayAdapter>): GatewayConfig {
  const env = typeof process !== "undefined" ? process.env : {};

  if (config.provider === "midtrans") {
    const key = config.serverKey || env.MIDTRANS_SERVER_KEY;
    if (!key) {
      throw new ConfigurationError(
        "Midtrans serverKey is required. Pass it in config or set MIDTRANS_SERVER_KEY env var.",
      );
    }
    const sandbox = config.sandbox ?? env.MIDTRANS_SANDBOX === "true";
    return { ...config, serverKey: key, sandbox };
  }

  if (config.provider === "xendit") {
    const key = config.secretKey || env.XENDIT_SECRET_KEY;
    if (!key) {
      throw new ConfigurationError(
        "Xendit secretKey is required. Pass it in config or set XENDIT_SECRET_KEY env var.",
      );
    }
    return { ...config, secretKey: key };
  }

  if (config.provider === "duitku") {
    const code = config.merchantCode || env.DUITKU_MERCHANT_CODE;
    const key = config.merchantKey || env.DUITKU_MERCHANT_KEY;
    if (!code || !key) {
      throw new ConfigurationError(
        "Duitku merchantCode and merchantKey are required. Pass them in config or set DUITKU_MERCHANT_CODE and DUITKU_MERCHANT_KEY env vars.",
      );
    }
    if (!config.returnUrl || !config.callbackUrl) {
      throw new ConfigurationError(
        "Duitku returnUrl and callbackUrl are required at configure() time.",
      );
    }
    const sandbox = config.sandbox ?? env.DUITKU_SANDBOX === "true";
    return { ...config, merchantCode: code, merchantKey: key, sandbox };
  }

  if (config.provider === "doku") {
    const clientId = config.clientId || env.DOKU_CLIENT_ID;
    const clientSecret = config.clientSecret || env.DOKU_CLIENT_SECRET;
    const privateKey = config.privateKey || env.DOKU_PRIVATE_KEY;
    const merchantId = config.merchantId || env.DOKU_MERCHANT_ID;
    const terminalId = config.terminalId || env.DOKU_TERMINAL_ID;
    if (!clientId || !clientSecret || !privateKey || !merchantId || !terminalId) {
      throw new ConfigurationError(
        "DOKU clientId, clientSecret, privateKey, merchantId, and terminalId are required. Pass them in config or set DOKU_CLIENT_ID, DOKU_CLIENT_SECRET, DOKU_PRIVATE_KEY, DOKU_MERCHANT_ID, and DOKU_TERMINAL_ID env vars.",
      );
    }
    const sandbox = config.sandbox ?? env.DOKU_SANDBOX === "true";
    return { ...config, clientId, clientSecret, privateKey, merchantId, terminalId, sandbox };
  }

  if (customAdapters.has((config as any).provider)) {
    return config;
  }

  throw new ConfigurationError(`Unknown provider: ${(config as GatewayConfig).provider}`);
}

class Gateway {
  /** Custom adapters registered via Gateway.registerProvider(). */
  private static _customAdapters = new Map<string, () => GatewayAdapter>();

  private _provider: string | null = null;
  private _config: unknown = null;
  private _adapter: GatewayAdapter | null = null;

  /**
   * Register a custom provider adapter so it can be used with `configure()`.
   *
   * @example
   *   Gateway.registerProvider("finpay", () => new FinpayAdapter());
   *   gateway.configure({ provider: "finpay" as any, apiKey: "..." });
   */
  static registerProvider(name: string, factory: () => GatewayAdapter): void {
    if (BUILTIN_ADAPTERS[name]) {
      throw new ConfigurationError(
        `Cannot override built-in provider "${name}". Choose a different name.`,
      );
    }
    Gateway._customAdapters.set(name, factory);
  }

  /**
   * Remove a previously registered custom provider.
   */
  static unregisterProvider(name: string): boolean {
    return Gateway._customAdapters.delete(name);
  }

  configure(config: GatewayConfig): void {
    if (this._provider !== null) {
      throw new ConfigurationError(
        "Gateway is already configured. Call gateway.reset() before re-configuring.",
      );
    }

    this._config = resolveConfig(config, Gateway._customAdapters);
    this._provider = config.provider;
    this._adapter = createAdapter(config.provider, Gateway._customAdapters);
  }

  /**
   * Configure the gateway with a custom adapter instance directly.
   * Bypasses the built-in factory and config resolver — you own the adapter lifecycle.
   *
   * @param provider  A label for this provider (used in error messages).
   * @param adapter   An object implementing the GatewayAdapter interface.
   * @param config    Provider-specific config — passed through to adapter methods as-is.
   *
   * @example
   *   gateway.useAdapter("finpay", new FinpayAdapter(), { apiKey: "..." });
   *   const result = await gateway.charge("INV-001", 50000);
   */
  useAdapter(provider: string, adapter: GatewayAdapter, config: unknown = {}): void {
    if (this._provider !== null) {
      throw new ConfigurationError(
        "Gateway is already configured. Call gateway.reset() before re-configuring.",
      );
    }

    this._provider = provider;
    this._adapter = adapter;
    this._config = config;
  }

  reset(): void {
    this._provider = null;
    this._config = null;
    this._adapter = null;
  }

  private createAdapter(provider: string): GatewayAdapter {
    const factory = BUILTIN_ADAPTERS[provider] ?? Gateway._customAdapters.get(provider);
    if (!factory) {
      throw new ConfigurationError(
        `Unknown provider: "${provider}". Register it first with Gateway.registerProvider().`,
      );
    }
    return factory();
  }

  private assertConfigured(): { provider: string; config: unknown; adapter: GatewayAdapter } {
    if (this._provider == null || this._config == null || this._adapter == null) {
      throw new ConfigurationError("Gateway is not configured. Call gateway.configure() first.");
    }
    return {
      provider: this._provider,
      config: this._config,
      adapter: this._adapter,
    };
  }

  private buildChargeConfig(config: unknown, options: ChargeOptions): unknown {
    const cfg = config as Record<string, unknown>;
    if (this._provider === "duitku") {
      return {
        ...cfg,
        ...(options.returnUrl ? { returnUrl: options.returnUrl } : {}),
        ...(options.callbackUrl ? { callbackUrl: options.callbackUrl } : {}),
      };
    }
    return config;
  }

  private buildNotificationExtra(
    _config: unknown,
    options: ChargeOptions,
  ): MidtransNotificationOptions | undefined {
    if (this._provider === "midtrans" && options.notificationUrl) {
      return { overrideNotificationUrl: options.notificationUrl };
    }
    return undefined;
  }

  async charge(
    orderId: string,
    amount: number,
    options: ChargeOptions = {},
  ): Promise<GatewayChargeResult> {
    const { config, adapter } = this.assertConfigured();

    const qrOptions: ApiQrCreateOptions = {
      orderId,
      amount,
      ...(options.description ? { description: options.description } : {}),
      ...(options.customerEmail ? { customerEmail: options.customerEmail } : {}),
    };

    const mergedConfig = this.buildChargeConfig(config, options);
    const extra = this.buildNotificationExtra(config, options);

    return adapter.createDynamicQr(qrOptions, mergedConfig, extra);
  }

  async status(orderId: string): Promise<GatewayStatusResult> {
    const { config, adapter } = this.assertConfigured();
    return adapter.checkPaymentStatus(orderId, config);
  }

  verify(
    payload: unknown,
    headers?: Record<string, string | string[] | undefined>,
  ): WebhookResult {
    const { config, adapter } = this.assertConfigured();
    return adapter.parseWebhook(payload, config, headers);
  }

  toDynamic(
    qrisString: string,
    amount: number,
    options?: GatewayDynamicOptions,
  ): string {
    this.assertConfigured();
    return staticToDynamic(qrisString, {
      amount,
      ...options,
    });
  }

  async cancel(orderId: string): Promise<void> {
    const { provider, config, adapter } = this.assertConfigured();

    if (provider !== "midtrans") {
      throw new ProviderCapabilityError(
        `cancel() is not supported by the ${provider} adapter.`,
      );
    }

    await (adapter as MidtransAdapter).cancel(orderId, config as MidtransConfig);
  }

  async expire(orderId: string): Promise<void> {
    const { provider, config, adapter } = this.assertConfigured();

    if (provider !== "midtrans") {
      throw new ProviderCapabilityError(
        `expire() is not supported by the ${provider} adapter.`,
      );
    }

    await (adapter as MidtransAdapter).expire(orderId, config as MidtransConfig);
  }

  async refund(orderId: string, options: RefundOptions = {}): Promise<void> {
    const { provider, config, adapter } = this.assertConfigured();

    if (provider !== "midtrans") {
      throw new ProviderCapabilityError(
        `refund() is not supported by the ${provider} adapter.`,
      );
    }

    await (adapter as MidtransAdapter).refund(orderId, config as MidtransConfig, options);
  }

  async pollPaymentStatus(
    orderId: string,
    options?: PollOptions,
  ): Promise<PaymentStatusResult> {
    const { config, adapter } = this.assertConfigured();
    return adapter.pollPaymentStatus(orderId, config, options);
  }
}

export { Gateway };
export const gateway = new Gateway();
