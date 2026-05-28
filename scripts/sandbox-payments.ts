import { gateway, type GatewayConfig } from "../src";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
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
  const qris = await gateway.createQrisPayment({
    orderId: `SDK-SANDBOX-QRIS-${now}`,
    amount: Number(process.env.SANDBOX_AMOUNT ?? "10000"),
    customerEmail: process.env.SANDBOX_CUSTOMER_EMAIL,
    notificationUrl: process.env.SANDBOX_NOTIFICATION_URL,
  });
  console.log("qris", {
    orderId: qris.orderId,
    gatewayOrderId: qris.gatewayOrderId,
    hasQrisString: Boolean(qris.qrisString),
    paymentUrl: qris.paymentUrl,
  });

  if (capabilities.hostedCheckout) {
    const checkout = await gateway.createHostedCheckout({
      orderId: `SDK-SANDBOX-CHECKOUT-${now}`,
      amount: Number(process.env.SANDBOX_AMOUNT ?? "10000"),
      enabledMethods: ["qris", "virtual_account", "ewallet"],
      customerEmail: process.env.SANDBOX_CUSTOMER_EMAIL,
      notificationUrl: process.env.SANDBOX_NOTIFICATION_URL,
      returnUrl: process.env.SANDBOX_RETURN_URL,
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
