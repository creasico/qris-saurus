import { createHash, createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { dokuAdapter } from "../../../src/providers/adapters/doku";
import { duitkuAdapter } from "../../../src/providers/adapters/duitku";
import { midtransAdapter } from "../../../src/providers/adapters/midtrans";
import { xenditAdapter } from "../../../src/providers/adapters/xendit";
import type { MidtransWebhookPayload } from "../../../src/providers/adapters/types";

// ─── Midtrans ────────────────────────────────────────────────────────────────
// signature = SHA512(orderId + statusCode + grossAmount + serverKey)

describe("midtransAdapter.verifyWebhook", () => {
  const serverKey = "SB-Mid-server-testkey";
  const validPayload: MidtransWebhookPayload = {
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

describe("midtransAdapter.parseWebhook", () => {
  const serverKey = "SB-Mid-server-testkey";
  const validPayloadBase: MidtransWebhookPayload = {
    order_id: "INV-002",
    status_code: "200",
    gross_amount: "100000.00",
    transaction_status: "settlement",
    fraud_status: "accept",
    settlement_time: "2026-05-06 21:32:50",
    transaction_id: "tx-123",
    payment_type: "qris",
    acquirer: "gopay",
  };
  const validPayload: MidtransWebhookPayload = {
    ...validPayloadBase,
    signature_key: createHash("sha512")
      .update("INV-002" + "200" + "100000.00" + serverKey)
      .digest("hex"),
  };

  test("returns normalized paid status for valid settlement webhook", () => {
    const result = midtransAdapter.parseWebhook(validPayload, { serverKey });
    expect(result.valid).toBe(true);
    expect(result.orderId).toBe("INV-002");
    expect(result.status).toBe("paid");
    expect(result.amount).toBe(100000);
    expect(result.providerMeta?.transactionId).toBe("tx-123");
    expect(result.providerMeta?.paymentType).toBe("qris");
    expect(result.providerMeta?.acquirer).toBe("gopay");
    expect(result.paidAt).toBeInstanceOf(Date);
  });

  test("marks invalid signature without losing normalized status", () => {
    const tampered = { ...validPayload, signature_key: "deadbeef" };
    const result = midtransAdapter.parseWebhook(tampered, { serverKey });
    expect(result.valid).toBe(false);
    expect(result.status).toBe("paid");
  });

  test("maps denied status to failed", () => {
    expect(
      midtransAdapter.getWebhookStatus({ transaction_status: "deny" }),
    ).toBe("failed");
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
// signature = HMAC-SHA256(merchantCode + amount + merchantOrderId, apiKey)

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
    signature: "3de1d0dddbddb7febbb1de7293c23d9214213290a3759294eca9b24b86c1f0e4",
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

// ─── Xendit parseWebhook ────────────────────────────────────────────────────

describe("xenditAdapter.parseWebhook", () => {
  const config = { secretKey: "xnd_test", callbackToken: "my-token" };

  test("returns valid=true with correct callback token", () => {
    const payload = {
      event: "qr.payment.completed",
      data: {
        reference_id: "INV-X01",
        status: "COMPLETED",
        amount: 50000,
        created: "2026-05-07T10:00:00.000Z",
        payments: [
          {
            status: "SUCCEEDED",
            amount: 50000,
            created: "2026-05-07T10:00:05.000Z",
          },
        ],
      },
    };
    const headers = { "x-callback-token": "my-token" };
    const result = xenditAdapter.parseWebhook(payload, config, headers);
    expect(result.valid).toBe(true);
    expect(result.orderId).toBe("INV-X01");
    expect(result.status).toBe("paid");
    expect(result.amount).toBe(50000);
    expect(result.paidAt).toBeInstanceOf(Date);
  });

  test("throws error when callbackToken is missing from config", () => {
    const configNoToken = { secretKey: "xnd_test" } as any;
    const payload = { data: { reference_id: "INV-X02", status: "ACTIVE" } };
    expect(() => xenditAdapter.parseWebhook(payload, configNoToken)).toThrow(/missing callbackToken/);
  });
});

// ─── Duitku parseWebhook ────────────────────────────────────────────────────

describe("duitkuAdapter.parseWebhook", () => {
  const config = {
    merchantCode: "DS12345",
    merchantKey: "secret-merchant-key",
    returnUrl: "https://example.com/return",
    callbackUrl: "https://example.com/callback",
  };
  const validPayload = {
    merchantCode: "DS12345",
    amount: "75000",
    merchantOrderId: "INV-001",
    resultCode: "00",
    signature: "3de1d0dddbddb7febbb1de7293c23d9214213290a3759294eca9b24b86c1f0e4",
  };

  test("returns normalized paid result with valid signature", () => {
    const result = duitkuAdapter.parseWebhook(validPayload, config);
    expect(result.valid).toBe(true);
    expect(result.orderId).toBe("INV-001");
    expect(result.status).toBe("paid");
    expect(result.amount).toBe(75000);
  });

  test("returns failed status for resultCode 01 with valid signature", () => {
    const payload = { ...validPayload, resultCode: "01" };
    const result = duitkuAdapter.parseWebhook(payload, config);
    expect(result.valid).toBe(true);
    expect(result.status).toBe("failed");
  });

  test("throws when signature is wrong by default", () => {
    const payload = { ...validPayload, signature: "deadbeef" };
    expect(() => duitkuAdapter.parseWebhook(payload, config)).toThrow(/verification failed/);
  });

  test("can return a safe invalid result when explicitly requested", () => {
    const payload = { ...validPayload, signature: "deadbeef" };
    const result = duitkuAdapter.parseWebhook(payload, config, undefined, { throwOnInvalid: false });
    expect(result.valid).toBe(false);
    expect(result.orderId).toBe("");
    expect(result.status).toBe("pending");
    expect(result.amount).toBeUndefined();
  });
});

// ─── DOKU parseWebhook ──────────────────────────────────────────────────────

describe("dokuAdapter.parseWebhook", () => {
  const config = {
    clientId: "BRN-TEST",
    clientSecret: "doku-secret",
    privateKey: "unused-in-webhook-tests",
    merchantId: "47435",
    terminalId: "A01",
    webhookPath: "/webhooks/doku",
  };

  const payload = {
    originalPartnerReferenceNo: "INV-DOKU-001",
    originalReferenceNo: "DOKU-REF-001",
    latestTransactionStatus: "00",
    transactionStatusDesc: "Success",
    paidTime: "2026-05-07T10:00:05+07:00",
    amount: { value: "50000.00", currency: "IDR" },
  };
  const now = new Date("2026-05-07T03:00:30.000Z");

  function signedHeaders(body: unknown) {
    return signedHeadersForBodyString(JSON.stringify(body));
  }

  function signedHeadersForBodyString(body: string, timestamp = "2026-05-07T03:00:00.000Z") {
    const token = "access-token-123";
    const digest = createHash("sha256")
      .update(body)
      .digest("hex")
      .toLowerCase();
    const stringToSign = `POST:/webhooks/doku:${token}:${digest}:${timestamp}`;
    const signature = createHmac("sha512", config.clientSecret)
      .update(stringToSign)
      .digest("base64");
    return {
      "x-timestamp": timestamp,
      authorization: `Bearer ${token}`,
      "x-signature": signature,
    };
  }

  test("returns normalized paid result with valid SNAP signature", () => {
    const result = dokuAdapter.parseWebhook(payload, config, signedHeaders(payload), { now });
    expect(result.valid).toBe(true);
    expect(result.orderId).toBe("INV-DOKU-001");
    expect(result.status).toBe("paid");
    expect(result.amount).toBe(50000);
    expect(result.paidAt).toBeInstanceOf(Date);
    expect(result.providerMeta?.referenceNo).toBe("DOKU-REF-001");
  });

  test("maps latestTransactionStatus 05 to cancelled", () => {
    const cancelledPayload = { ...payload, latestTransactionStatus: "05" };
    const result = dokuAdapter.parseWebhook(cancelledPayload, config, signedHeaders(cancelledPayload), { now });
    expect(result.valid).toBe(true);
    expect(result.status).toBe("cancelled");
  });

  test("returns normalized Virtual Account payment notification metadata", () => {
    const vaPayload = {
      partnerServiceId: "   19008",
      customerNo: "00000000000000000001",
      virtualAccountNo: "  19008000000000000000000001",
      virtualAccountName: "Customer Name",
      trxId: "INV-DOKU-VA-001",
      paymentRequestId: "12839218738127830",
      paidAmount: { value: "11500.00", currency: "IDR" },
      additionalInfo: { channel: "VIRTUAL_ACCOUNT_BCA" },
      trxDateTime: "2026-05-07T10:00:05+07:00",
      virtualAccountTrxType: "C",
    };
    const webhookPayload = {
      virtualAccountData: vaPayload,
      additionalInfo: { channel: "VIRTUAL_ACCOUNT_BCA" },
    };

    const result = dokuAdapter.parseWebhook(webhookPayload, config, signedHeaders(webhookPayload), { now });

    expect(result).toMatchObject({
      valid: true,
      provider: "doku",
      method: "virtual_account",
      orderId: "INV-DOKU-VA-001",
      status: "paid",
      amount: 11500,
      bank: "bca",
      vaNumber: "19008000000000000000000001",
    });
    expect(result.providerMeta?.paymentRequestId).toBe("12839218738127830");
  });

  test("returns normalized E-Wallet payment notification metadata", () => {
    const ewalletPayload = {
      originalPartnerReferenceNo: "INV-DOKU-DANA-001",
      originalReferenceNo: "DOKU-DANA-REF-1",
      serviceCode: "55",
      latestTransactionStatus: "00",
      transactionStatusDesc: "SUCCESS",
      transAmount: { value: "75000.00", currency: "IDR" },
      paidTime: "2026-05-07T10:00:05+07:00",
      additionalInfo: { acquirer: { id: "EMONEY_DANA_SNAP" } },
    };

    const result = dokuAdapter.parseWebhook(ewalletPayload, config, signedHeaders(ewalletPayload), { now });

    expect(result).toMatchObject({
      valid: true,
      provider: "doku",
      method: "ewallet",
      channel: "dana",
      orderId: "INV-DOKU-DANA-001",
      gatewayTransactionId: "DOKU-DANA-REF-1",
      status: "paid",
      amount: 75000,
    });
    expect(result.providerMeta?.channel).toBe("EMONEY_DANA_SNAP");
  });

  test("accepts signatures computed from the raw request body", () => {
    const rawBody = JSON.stringify(payload, null, 2);
    const result = dokuAdapter.parseWebhook(payload, config, signedHeadersForBodyString(rawBody), {
      now,
      rawBody,
    });
    expect(result.valid).toBe(true);
    expect(result.status).toBe("paid");
  });

  test("rejects webhook replay outside the timestamp window", () => {
    const headers = signedHeadersForBodyString(JSON.stringify(payload), "2026-05-07T02:00:00.000Z");
    expect(() => dokuAdapter.parseWebhook(payload, config, headers, { now })).toThrow(/verification failed/);
  });

  test("throws when signature header is wrong by default", () => {
    const headers = { ...signedHeaders(payload), "x-signature": "wrong" };
    expect(() => dokuAdapter.parseWebhook(payload, config, headers, { now })).toThrow(/verification failed/);
  });

  test("can return a safe invalid result when explicitly requested", () => {
    const headers = { ...signedHeaders(payload), "x-signature": "wrong" };
    const result = dokuAdapter.parseWebhook(payload, config, headers, {
      now,
      throwOnInvalid: false,
    });
    expect(result.valid).toBe(false);
    expect(result.orderId).toBe("");
    expect(result.status).toBe("pending");
    expect(result.amount).toBeUndefined();
  });
});
