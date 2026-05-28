import {
  gateway,
  type EwalletChannel,
  type GatewayConfig,
  type PaymentMethod,
  type VirtualAccountBank,
} from "../src";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function sandboxMethods(): Set<PaymentMethod | "checkout"> {
  const raw = process.env.SANDBOX_METHODS ?? "qris,checkout";
  return new Set(
    raw.split(",")
      .map((method) => method.trim())
      .filter(Boolean) as Array<PaymentMethod | "checkout">,
  );
}

function sandboxAmount(): number {
  return Number(process.env.SANDBOX_AMOUNT ?? "10000");
}

function pickSupported<T extends string>(
  envName: string,
  supported: readonly T[] | undefined,
  fallback: T,
): T {
  const candidate = optional(envName) as T | undefined;
  if (candidate && supported?.includes(candidate)) return candidate;
  return supported?.[0] ?? fallback;
}

function configFromEnv(provider: string): GatewayConfig {
  if (provider === "midtrans") {
    return {
      provider: "midtrans",
      serverKey: required("MIDTRANS_SERVER_KEY"),
      sandbox: process.env.MIDTRANS_SANDBOX !== "false",
    };
  }
  if (provider === "xendit") {
    return {
      provider: "xendit",
      secretKey: required("XENDIT_SECRET_KEY"),
      callbackToken: process.env.XENDIT_CALLBACK_TOKEN,
    };
  }
  if (provider === "duitku") {
    return {
      provider: "duitku",
      merchantCode: required("DUITKU_MERCHANT_CODE"),
      merchantKey: required("DUITKU_MERCHANT_KEY"),
      returnUrl: required("DUITKU_RETURN_URL"),
      callbackUrl: required("DUITKU_CALLBACK_URL"),
      sandbox: process.env.DUITKU_SANDBOX !== "false",
    };
  }
  if (provider === "doku") {
    return {
      provider: "doku",
      clientId: required("DOKU_CLIENT_ID"),
      clientSecret: required("DOKU_CLIENT_SECRET"),
      privateKey: required("DOKU_PRIVATE_KEY"),
      merchantId: required("DOKU_MERCHANT_ID"),
      terminalId: required("DOKU_TERMINAL_ID"),
      virtualAccountPartnerServiceId:
        optional("DOKU_VA_PARTNER_SERVICE_ID") ?? optional("DOKU_VIRTUAL_ACCOUNT_PARTNER_SERVICE_ID"),
      sandbox: process.env.DOKU_SANDBOX !== "false",
    };
  }
  throw new Error(`Unsupported SANDBOX_PROVIDER: ${provider}`);
}

async function main() {
  if (process.env.RUN_PAYMENT_SANDBOX !== "true") {
    throw new Error("Set RUN_PAYMENT_SANDBOX=true to create real sandbox transactions.");
  }

  const provider = process.env.SANDBOX_PROVIDER ?? "midtrans";
  gateway.configure(configFromEnv(provider));

  const capabilities = gateway.capabilities();
  console.log("provider", provider);
  console.log("capabilities", capabilities);

  const now = Date.now();
  const methods = sandboxMethods();
  const amount = sandboxAmount();

  if (methods.has("qris")) {
    const qris = await gateway.createQrisPayment({
      orderId: `SDK-SANDBOX-QRIS-${now}`,
      amount,
      customerEmail: optional("SANDBOX_CUSTOMER_EMAIL"),
      notificationUrl: optional("SANDBOX_NOTIFICATION_URL"),
    });
    console.log("qris", {
      orderId: qris.orderId,
      gatewayOrderId: qris.gatewayOrderId,
      hasQrisString: Boolean(qris.qrisString),
      paymentUrl: qris.paymentUrl,
    });
  }

  if (methods.has("virtual_account") && capabilities.virtualAccount?.banks.length) {
    const bank = pickSupported<VirtualAccountBank>(
      "SANDBOX_VA_BANK",
      capabilities.virtualAccount.banks,
      "bca",
    );
    const va = await gateway.createVirtualAccount({
      orderId: `SDK-SANDBOX-VA-${bank.toUpperCase()}-${now}`,
      amount,
      bank,
      customerName: optional("SANDBOX_CUSTOMER_NAME") ?? "QRIS Saurus Sandbox",
      customerEmail: optional("SANDBOX_CUSTOMER_EMAIL"),
      customerPhone: optional("SANDBOX_CUSTOMER_PHONE"),
      notificationUrl: optional("SANDBOX_NOTIFICATION_URL"),
      expiresAt: new Date(Date.now() + Number(process.env.SANDBOX_EXPIRES_IN_MS ?? "3600000")),
    });
    console.log("virtual_account", {
      orderId: va.orderId,
      gatewayOrderId: va.gatewayOrderId,
      bank: va.bank,
      vaNumber: va.vaNumber,
      paymentUrl: va.paymentUrl,
      expiresAt: va.expiresAt,
    });
  }

  if (methods.has("ewallet") && capabilities.ewallet?.channels.length) {
    const channel = pickSupported<EwalletChannel>(
      "SANDBOX_EWALLET_CHANNEL",
      capabilities.ewallet.channels,
      "dana",
    );
    const ewallet = await gateway.createEwallet({
      orderId: `SDK-SANDBOX-EWALLET-${channel.toUpperCase()}-${now}`,
      amount,
      channel,
      customerName: optional("SANDBOX_CUSTOMER_NAME"),
      customerEmail: optional("SANDBOX_CUSTOMER_EMAIL"),
      customerPhone: optional("SANDBOX_CUSTOMER_PHONE"),
      notificationUrl: optional("SANDBOX_NOTIFICATION_URL"),
      returnUrl: optional("SANDBOX_RETURN_URL"),
      callbackUrl: optional("SANDBOX_CALLBACK_URL") ?? optional("SANDBOX_RETURN_URL"),
    });
    console.log("ewallet", {
      orderId: ewallet.orderId,
      gatewayOrderId: ewallet.gatewayOrderId,
      channel: ewallet.channel,
      paymentUrl: ewallet.paymentUrl,
      deeplinkUrl: ewallet.deeplinkUrl,
    });
  }

  if (methods.has("checkout") && capabilities.hostedCheckout) {
    const checkout = await gateway.createHostedCheckout({
      orderId: `SDK-SANDBOX-CHECKOUT-${now}`,
      amount,
      enabledMethods: ["qris", "virtual_account", "ewallet"],
      customerEmail: optional("SANDBOX_CUSTOMER_EMAIL"),
      notificationUrl: optional("SANDBOX_NOTIFICATION_URL"),
      returnUrl: optional("SANDBOX_RETURN_URL"),
    });
    console.log("checkout", {
      orderId: checkout.orderId,
      gatewayOrderId: checkout.gatewayOrderId,
      checkoutUrl: checkout.checkoutUrl,
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
