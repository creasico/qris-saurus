import { validate } from "qris-saurus";
import type { AppConfig, PaymentMode } from "../types";

const allowedModes: PaymentMode[] = ["auto", "local", "midtrans", "xendit", "duitku"];

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return normalizeEnvValue(value);
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value?.trim() ? normalizeEnvValue(value) : undefined;
}

export function loadConfig(): AppConfig {
  const paymentMode = (process.env.PAYMENT_MODE?.trim() ?? "auto") as PaymentMode;
  if (!allowedModes.includes(paymentMode)) {
    throw new Error(`Unsupported PAYMENT_MODE: ${paymentMode}`);
  }

  const merchantQrisStatic = requireEnv("MERCHANT_QRIS_STATIC");
  const validation = validate(merchantQrisStatic);
  if (!validation.valid) {
    throw new Error(`MERCHANT_QRIS_STATIC is invalid: ${validation.errors.join(", ")}`);
  }

  const midtransServerKey = optionalEnv("MIDTRANS_SERVER_KEY");
  const xenditSecretKey = optionalEnv("XENDIT_SECRET_KEY");
  const duitkuMerchantCode = optionalEnv("DUITKU_MERCHANT_CODE");
  const duitkuMerchantKey = optionalEnv("DUITKU_MERCHANT_KEY");
  const duitkuReturnUrl = optionalEnv("DUITKU_RETURN_URL");
  const duitkuCallbackUrl = optionalEnv("DUITKU_CALLBACK_URL");
  const xenditCallbackToken = optionalEnv("XENDIT_CALLBACK_TOKEN");

  const config: AppConfig = {
    port: Number(process.env.PORT ?? 3000),
    paymentMode,
    merchantQrisStatic,
    webhook: {
      ...(xenditCallbackToken ? { xenditCallbackToken } : {}),
    },
    gateway: {},
  };

  if (midtransServerKey) {
    config.gateway.midtrans = {
      serverKey: midtransServerKey,
      sandbox: process.env.MIDTRANS_SANDBOX !== "false",
    };
  }

  if (xenditSecretKey) {
    config.gateway.xendit = {
      secretKey: xenditSecretKey,
    };
  }

  if (duitkuMerchantCode && duitkuMerchantKey && duitkuReturnUrl && duitkuCallbackUrl) {
    config.gateway.duitku = {
      merchantCode: duitkuMerchantCode,
      merchantKey: duitkuMerchantKey,
      sandbox: process.env.DUITKU_SANDBOX !== "false",
      returnUrl: duitkuReturnUrl,
      callbackUrl: duitkuCallbackUrl,
    };
  }

  if (paymentMode === "midtrans" && !config.gateway.midtrans) {
    throw new Error("PAYMENT_MODE=midtrans requires MIDTRANS_SERVER_KEY");
  }

  if (paymentMode === "xendit" && !config.gateway.xendit) {
    throw new Error("PAYMENT_MODE=xendit requires XENDIT_SECRET_KEY");
  }

  if (paymentMode === "xendit" && !config.webhook.xenditCallbackToken) {
    // Optional for checkout flow, but needed for webhook simulation.
  }

  if (paymentMode === "duitku" && !config.gateway.duitku) {
    throw new Error(
      "PAYMENT_MODE=duitku requires DUITKU_MERCHANT_CODE, DUITKU_MERCHANT_KEY, DUITKU_RETURN_URL, and DUITKU_CALLBACK_URL",
    );
  }

  return config;
}
