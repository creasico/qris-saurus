import { createHash } from "node:crypto";
import { afterEach, describe, expect, test } from "bun:test";
import { ConfigurationError, GatewayError, ProviderCapabilityError } from "../../src/gateway/errors";
import { Gateway, gateway } from "../../src/gateway/index";
import { genericStaticQris } from "../fixtures/qris";

afterEach(() => {
  gateway.reset();
});

// ─── configure / reset lifecycle ─────────────────────────────────────────────

describe("gateway.configure", () => {
  test("succeeds with midtrans config", () => {
    expect(() =>
      gateway.configure({ provider: "midtrans", serverKey: "SB-test", sandbox: true }),
    ).not.toThrow();
  });

  test("succeeds with xendit config", () => {
    expect(() =>
      gateway.configure({ provider: "xendit", secretKey: "xnd_test" }),
    ).not.toThrow();
  });

  test("succeeds with duitku config", () => {
    expect(() =>
      gateway.configure({
        provider: "duitku",
        merchantCode: "DS123",
        merchantKey: "key",
        sandbox: true,
        returnUrl: "https://example.com/return",
        callbackUrl: "https://example.com/callback",
      }),
    ).not.toThrow();
  });

  test("throws ConfigurationError on double configure", () => {
    gateway.configure({ provider: "midtrans", serverKey: "SB-test", sandbox: true });
    expect(() =>
      gateway.configure({ provider: "midtrans", serverKey: "SB-test", sandbox: true }),
    ).toThrow(ConfigurationError);
  });

  test("throws ConfigurationError when duitku returnUrl is missing", () => {
    expect(() =>
      gateway.configure({
        provider: "duitku",
        merchantCode: "DS123",
        merchantKey: "key",
        sandbox: true,
        returnUrl: "",
        callbackUrl: "https://example.com/callback",
      }),
    ).toThrow(ConfigurationError);
  });

  test("throws ConfigurationError when duitku callbackUrl is missing", () => {
    expect(() =>
      gateway.configure({
        provider: "duitku",
        merchantCode: "DS123",
        merchantKey: "key",
        sandbox: true,
        returnUrl: "https://example.com/return",
        callbackUrl: "",
      }),
    ).toThrow(ConfigurationError);
  });
});

describe("gateway.reset", () => {
  test("clears state and allows re-configure", () => {
    gateway.configure({ provider: "midtrans", serverKey: "SB-test-1", sandbox: true });
    gateway.reset();
    expect(() =>
      gateway.configure({ provider: "midtrans", serverKey: "SB-test-2", sandbox: false }),
    ).not.toThrow();
  });
});

// ─── not configured errors ───────────────────────────────────────────────────

describe("gateway (not configured)", () => {
  test("charge throws ConfigurationError when not configured", async () => {
    await expect(gateway.charge("INV-001", 25000)).rejects.toThrow(ConfigurationError);
  });

  test("status throws ConfigurationError when not configured", async () => {
    await expect(gateway.status("INV-001")).rejects.toThrow(ConfigurationError);
  });

  test("verify throws ConfigurationError when not configured", () => {
    expect(() => gateway.verify({})).toThrow(ConfigurationError);
  });

  test("toDynamic throws ConfigurationError when not configured", () => {
    expect(() => gateway.toDynamic(genericStaticQris, 25000)).toThrow(ConfigurationError);
  });

  test("cancel throws ConfigurationError when not configured", async () => {
    await expect(gateway.cancel("INV-001")).rejects.toThrow(ConfigurationError);
  });
});

// ─── env-var auto-config ─────────────────────────────────────────────────────

describe("gateway env-var auto-config", () => {
  test("reads MIDTRANS_SERVER_KEY from env when not in config", () => {
    const original = process.env.MIDTRANS_SERVER_KEY;
    process.env.MIDTRANS_SERVER_KEY = "SB-env-key";
    try {
      expect(() =>
        gateway.configure({ provider: "midtrans", serverKey: "", sandbox: true }),
      ).not.toThrow();
    } finally {
      if (original !== undefined) {
        process.env.MIDTRANS_SERVER_KEY = original;
      } else {
        delete process.env.MIDTRANS_SERVER_KEY;
      }
    }
  });

  test("reads XENDIT_SECRET_KEY from env when not in config", () => {
    const original = process.env.XENDIT_SECRET_KEY;
    process.env.XENDIT_SECRET_KEY = "xnd_env_key";
    try {
      expect(() =>
        gateway.configure({ provider: "xendit", secretKey: "" }),
      ).not.toThrow();
    } finally {
      if (original !== undefined) {
        process.env.XENDIT_SECRET_KEY = original;
      } else {
        delete process.env.XENDIT_SECRET_KEY;
      }
    }
  });

  test("reads DUITKU env vars when not in config", () => {
    const origCode = process.env.DUITKU_MERCHANT_CODE;
    const origKey = process.env.DUITKU_MERCHANT_KEY;
    process.env.DUITKU_MERCHANT_CODE = "DENV";
    process.env.DUITKU_MERCHANT_KEY = "env_key";
    try {
      expect(() =>
        gateway.configure({
          provider: "duitku",
          merchantCode: "",
          merchantKey: "",
          sandbox: true,
          returnUrl: "https://example.com/return",
          callbackUrl: "https://example.com/callback",
        }),
      ).not.toThrow();
    } finally {
      if (origCode !== undefined) process.env.DUITKU_MERCHANT_CODE = origCode;
      else delete process.env.DUITKU_MERCHANT_CODE;
      if (origKey !== undefined) process.env.DUITKU_MERCHANT_KEY = origKey;
      else delete process.env.DUITKU_MERCHANT_KEY;
    }
  });
});

// ─── toDynamic (local only) ──────────────────────────────────────────────────

describe("gateway.toDynamic", () => {
  test("converts static QRIS to dynamic (local, no network)", () => {
    gateway.configure({ provider: "midtrans", serverKey: "SB-test", sandbox: true });
    const result = gateway.toDynamic(genericStaticQris, 25000);
    expect(typeof result).toBe("string");
    expect(result).toContain("540825000.00"); // amount tag
  });

  test("includes merchantRef when provided", () => {
    gateway.configure({ provider: "midtrans", serverKey: "SB-test", sandbox: true });
    const result = gateway.toDynamic(genericStaticQris, 25000, { merchantRef: "INV-001" });
    expect(result).toContain("INV-001");
  });

  test("throws for invalid QRIS string", () => {
    gateway.configure({ provider: "midtrans", serverKey: "SB-test", sandbox: true });
    expect(() => gateway.toDynamic("invalid", 25000)).toThrow();
  });
});

// ─── Provider capability errors ──────────────────────────────────────────────

describe("gateway provider capabilities", () => {
  test("verify delegates to xendit parseWebhook", () => {
    gateway.configure({ provider: "xendit", secretKey: "xnd_test", callbackToken: "tok-abc" });
    const payload = {
      event: "qr.payment.completed",
      data: { reference_id: "INV-X01", status: "COMPLETED", amount: 50000 },
    };
    const result = gateway.verify(payload, { "x-callback-token": "tok-abc" });
    expect(result.valid).toBe(true);
    expect(result.orderId).toBe("INV-X01");
    expect(result.status).toBe("paid");
  });

  test("cancel throws ProviderCapabilityError on xendit", async () => {
    gateway.configure({ provider: "xendit", secretKey: "xnd_test" });
    await expect(gateway.cancel("INV-001")).rejects.toThrow(ProviderCapabilityError);
  });

  test("cancel throws ProviderCapabilityError on duitku", async () => {
    gateway.configure({
      provider: "duitku",
      merchantCode: "DS123",
      merchantKey: "key",
      sandbox: true,
      returnUrl: "https://example.com/return",
      callbackUrl: "https://example.com/callback",
    });
    await expect(gateway.cancel("INV-001")).rejects.toThrow(ProviderCapabilityError);
  });

  test("expire throws ProviderCapabilityError on xendit", async () => {
    gateway.configure({ provider: "xendit", secretKey: "xnd_test" });
    await expect(gateway.expire("INV-001")).rejects.toThrow(ProviderCapabilityError);
  });

  test("expire throws ProviderCapabilityError on duitku", async () => {
    gateway.configure({
      provider: "duitku",
      merchantCode: "DS123",
      merchantKey: "key",
      sandbox: true,
      returnUrl: "https://example.com/return",
      callbackUrl: "https://example.com/callback",
    });
    await expect(gateway.expire("INV-001")).rejects.toThrow(ProviderCapabilityError);
  });

  test("refund throws ProviderCapabilityError on xendit", async () => {
    gateway.configure({ provider: "xendit", secretKey: "xnd_test" });
    await expect(gateway.refund("INV-001")).rejects.toThrow(ProviderCapabilityError);
  });

  test("refund throws ProviderCapabilityError on duitku", async () => {
    gateway.configure({
      provider: "duitku",
      merchantCode: "DS123",
      merchantKey: "key",
      sandbox: true,
      returnUrl: "https://example.com/return",
      callbackUrl: "https://example.com/callback",
    });
    await expect(gateway.refund("INV-001")).rejects.toThrow(ProviderCapabilityError);
  });
});

// ─── webhook verification ────────────────────────────────────────────────────

describe("gateway.verify (midtrans)", () => {
  test("returns parsed webhook with valid signature", () => {
    const serverKey = "SB-Mid-server-testkey";
    gateway.configure({ provider: "midtrans", serverKey, sandbox: true });

    const payload = {
      order_id: "INV-001",
      status_code: "200",
      gross_amount: "75000.00",
      transaction_status: "settlement",
      fraud_status: "accept",
      settlement_time: "2026-05-07 10:00:00",
      signature_key: createHash("sha512")
        .update("INV-001" + "200" + "75000.00" + serverKey)
        .digest("hex"),
    };

    const result = gateway.verify(payload);
    expect(result.orderId).toBe("INV-001");
    expect(result.status).toBe("paid");
  });

  test("marks invalid signature", () => {
    const serverKey = "SB-Mid-server-testkey";
    gateway.configure({ provider: "midtrans", serverKey, sandbox: true });

    const payload = {
      order_id: "INV-001",
      status_code: "200",
      gross_amount: "75000.00",
      transaction_status: "settlement",
      signature_key: "deadbeef",
    };

    const result = gateway.verify(payload);
    expect(result.orderId).toBe("INV-001");
    expect(result.valid).toBe(false);
  });
});

// ─── errors module ───────────────────────────────────────────────────────────

describe("error classes", () => {
  test("ConfigurationError has correct code", () => {
    const err = new ConfigurationError("test");
    expect(err.code).toBe("CONFIGURATION_ERROR");
    expect(err.name).toBe("ConfigurationError");
    expect(err.message).toBe("test");
  });

  test("ProviderCapabilityError has correct code", () => {
    const err = new ProviderCapabilityError("test");
    expect(err.code).toBe("PROVIDER_CAPABILITY_ERROR");
    expect(err.name).toBe("ProviderCapabilityError");
  });

  test("both extend GatewayError", async () => {
    const { GatewayError } = await import("../../src/gateway/errors");
    expect(new ConfigurationError("test") instanceof GatewayError).toBe(true);
    expect(new ProviderCapabilityError("test") instanceof GatewayError).toBe(true);
  });
});

// ─── Custom adapter support ─────────────────────────────────────────────────

describe("gateway.useAdapter", () => {
  const mockAdapter = {
    createDynamicQr: async () => ({
      qrisString: "mock-qr-string",
      gatewayOrderId: "MOCK-001",
      raw: {},
    }),
    checkPaymentStatus: async () => ({
      orderId: "MOCK-001",
      status: "paid" as const,
      raw: {},
    }),
    pollPaymentStatus: async () => ({
      orderId: "MOCK-001",
      status: "paid" as const,
      raw: {},
    }),
    parseWebhook: () => ({
      valid: true,
      orderId: "MOCK-001",
      status: "paid" as const,
      raw: {},
    }),
  };

  test("accepts a custom adapter and delegates charge()", async () => {
    gateway.useAdapter("mock", mockAdapter, { apiKey: "test" });
    const result = await gateway.charge("INV-001", 50000);
    expect(result.qrisString).toBe("mock-qr-string");
    expect(result.gatewayOrderId).toBe("MOCK-001");
  });

  test("accepts a custom adapter and delegates status()", async () => {
    gateway.useAdapter("mock", mockAdapter, { apiKey: "test" });
    const result = await gateway.status("MOCK-001");
    expect(result.status).toBe("paid");
  });

  test("accepts a custom adapter and delegates verify()", () => {
    gateway.useAdapter("mock", mockAdapter, { apiKey: "test" });
    const result = gateway.verify({ some: "payload" });
    expect(result.valid).toBe(true);
    expect(result.orderId).toBe("MOCK-001");
  });

  test("throws on double useAdapter", () => {
    gateway.useAdapter("mock", mockAdapter, {});
    expect(() => gateway.useAdapter("mock2", mockAdapter, {})).toThrow(ConfigurationError);
  });

  test("useAdapter blocks subsequent configure", () => {
    gateway.useAdapter("mock", mockAdapter, {});
    expect(() =>
      gateway.configure({ provider: "midtrans", serverKey: "SB-test", sandbox: true }),
    ).toThrow(ConfigurationError);
  });

  test("reset then configure works after useAdapter", () => {
    gateway.useAdapter("mock", mockAdapter, {});
    gateway.reset();
    expect(() =>
      gateway.configure({ provider: "midtrans", serverKey: "SB-test", sandbox: true }),
    ).not.toThrow();
  });
});

describe("Gateway.registerProvider", () => {
  const mockFactory = () => ({
    createDynamicQr: async () => ({ qrisString: "reg-qr", gatewayOrderId: "REG-001", raw: {} }),
    checkPaymentStatus: async () => ({ orderId: "REG-001", status: "pending" as const, raw: {} }),
    pollPaymentStatus: async () => ({ orderId: "REG-001", status: "pending" as const, raw: {} }),
    parseWebhook: () => ({ valid: false, orderId: "", status: "pending" as const, raw: {} }),
  });

  test("registered provider works via configure()", () => {
    Gateway.registerProvider("testpay", mockFactory);
    try {
      // Configure using the registered provider
      gateway.configure({ provider: "testpay", apiKey: "test" } as any);
      const result = gateway.verify({});
      expect(result.valid).toBe(false);
    } finally {
      Gateway.unregisterProvider("testpay");
    }
  });

  test("cannot override built-in provider", () => {
    expect(() => Gateway.registerProvider("midtrans", mockFactory)).toThrow(ConfigurationError);
  });

  test("unregisterProvider removes custom provider", () => {
    Gateway.registerProvider("tempay", mockFactory);
    expect(Gateway.unregisterProvider("tempay")).toBe(true);
    expect(Gateway.unregisterProvider("tempay")).toBe(false); // already removed
  });
});
