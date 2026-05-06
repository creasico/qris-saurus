import { describe, expect, test } from "bun:test";
import { duitkuAdapter } from "../../../src/providers/adapters/duitku";
import { midtransAdapter } from "../../../src/providers/adapters/midtrans";
import { xenditAdapter } from "../../../src/providers/adapters/xendit";

// ─── Midtrans ────────────────────────────────────────────────────────────────
// signature = SHA512(orderId + statusCode + grossAmount + serverKey)

describe("midtransAdapter.verifyWebhook", () => {
  const serverKey = "SB-Mid-server-testkey";
  const validPayload = {
    order_id: "INV-001",
    status_code: "200",
    gross_amount: "75000.00",
    transaction_status: "settlement",
    signature_key:
      "2a04d173acdace723c4df3ee15fa07a4c43dda00686def56b8e2797f4d76a344f80029e9a2ed801a4b7ab9f8a8900f5da09711e18391fe2b88ff6da2b6a515e1",
  };

  test("accepts a valid signature", () => {
    expect(midtransAdapter.verifyWebhook(validPayload, { serverKey })).toBe(true);
  });

  test("rejects a tampered signature", () => {
    const tampered = { ...validPayload, signature_key: "deadbeef" };
    expect(midtransAdapter.verifyWebhook(tampered, { serverKey })).toBe(false);
  });

  test("rejects when signature_key is missing from payload", () => {
    const { signature_key: _, ...noSig } = validPayload;
    expect(midtransAdapter.verifyWebhook(noSig, { serverKey })).toBe(false);
  });

  test("rejects when gross_amount is tampered", () => {
    const tampered = { ...validPayload, gross_amount: "99999.00" };
    expect(midtransAdapter.verifyWebhook(tampered, { serverKey })).toBe(false);
  });

  test("rejects when wrong server key is used", () => {
    expect(
      midtransAdapter.verifyWebhook(validPayload, { serverKey: "wrong-key" }),
    ).toBe(false);
  });
});

// ─── Xendit ──────────────────────────────────────────────────────────────────
// verification = compare x-callback-token header against configured token

describe("xenditAdapter.verifyWebhook", () => {
  const callbackToken = "my-xendit-callback-token-abc123";

  test("accepts a valid callback token (lowercase header)", () => {
    expect(
      xenditAdapter.verifyWebhook({ "x-callback-token": callbackToken }, callbackToken),
    ).toBe(true);
  });

  test("accepts a valid callback token (uppercase header)", () => {
    expect(
      xenditAdapter.verifyWebhook({ "X-CALLBACK-TOKEN": callbackToken }, callbackToken),
    ).toBe(true);
  });

  test("rejects a wrong token", () => {
    expect(
      xenditAdapter.verifyWebhook({ "x-callback-token": "wrong-token" }, callbackToken),
    ).toBe(false);
  });

  test("rejects when header is missing", () => {
    expect(
      xenditAdapter.verifyWebhook({ "x-other-header": "value" }, callbackToken),
    ).toBe(false);
  });

  test("rejects when callbackToken is empty string", () => {
    expect(
      xenditAdapter.verifyWebhook({ "x-callback-token": "" }, ""),
    ).toBe(false);
  });
});

// ─── Duitku ──────────────────────────────────────────────────────────────────
// signature = MD5(merchantCode + amount + merchantOrderId + merchantKey)

describe("duitkuAdapter.verifyWebhook", () => {
  const config = {
    merchantCode: "DS12345",
    merchantKey: "secret-merchant-key",
  };
  const validPayload = {
    merchantCode: "DS12345",
    amount: "75000",
    merchantOrderId: "INV-001",
    resultCode: "00",
    signature: "8c9eaf3aea6fd952b49882225ed575ae",
  };

  test("accepts a valid signature", () => {
    expect(duitkuAdapter.verifyWebhook(validPayload, config)).toBe(true);
  });

  test("rejects a tampered signature", () => {
    const tampered = { ...validPayload, signature: "deadbeef" };
    expect(duitkuAdapter.verifyWebhook(tampered, config)).toBe(false);
  });

  test("rejects when amount is tampered", () => {
    const tampered = { ...validPayload, amount: "99999" };
    expect(duitkuAdapter.verifyWebhook(tampered, config)).toBe(false);
  });

  test("rejects when signature field is missing", () => {
    const { signature: _, ...noSig } = validPayload;
    expect(duitkuAdapter.verifyWebhook(noSig, config)).toBe(false);
  });

  test("rejects when wrong merchant key is used", () => {
    expect(
      duitkuAdapter.verifyWebhook(validPayload, { ...config, merchantKey: "wrong" }),
    ).toBe(false);
  });
});
