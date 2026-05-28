import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, test } from "bun:test";
import { dokuAdapter } from "../../../src/providers/adapters/doku";
import { duitkuAdapter } from "../../../src/providers/adapters/duitku";
import { xenditAdapter } from "../../../src/providers/adapters/xendit";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("remaining provider payment capabilities", () => {
  test("declares only production-wired methods for Xendit, Duitku, and DOKU", () => {
    expect(xenditAdapter.capabilities()).toEqual({ qris: true, hostedCheckout: true });
    expect(duitkuAdapter.capabilities()).toEqual({ qris: true });
    expect(dokuAdapter.capabilities()).toEqual({ qris: true });
  });
});

describe("xenditAdapter.createPayment/createCheckout", () => {
  test("wraps direct QRIS creation in the normalized PaymentResult shape", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({
        id: "qr_123",
        reference_id: "INV-XEN-QR-1",
        qr_string: "000201010212-xendit",
        expires_at: "2026-05-06T10:00:00.000Z",
      });
    }) as typeof fetch;

    const result = await xenditAdapter.createPayment(
      { method: "qris", orderId: "INV-XEN-QR-1", amount: 50000 },
      { secretKey: "xnd_development_test" },
    );

    expect(requestBody).toMatchObject({
      reference_id: "INV-XEN-QR-1",
      type: "DYNAMIC",
      currency: "IDR",
      amount: 50000,
      channel_code: "QRIS",
    });
    expect(result).toMatchObject({
      provider: "xendit",
      method: "qris",
      orderId: "INV-XEN-QR-1",
      gatewayOrderId: "qr_123",
      status: "pending",
      qrisString: "000201010212-xendit",
    });
  });

  test("creates a hosted checkout invoice with mapped payment methods", async () => {
    let requestUrl = "";
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({
        id: "inv_123",
        external_id: "INV-XEN-CO-1",
        invoice_url: "https://checkout.xendit.co/web/inv_123",
        expiry_date: "2026-05-06T10:00:00.000Z",
      });
    }) as typeof fetch;

    const result = await xenditAdapter.createCheckout(
      {
        orderId: "INV-XEN-CO-1",
        amount: 75000,
        enabledMethods: ["qris", "virtual_account", "ewallet"],
        customerEmail: "customer@example.com",
        returnUrl: "https://merchant.example/return",
      },
      { secretKey: "xnd_development_test" },
    );

    expect(requestUrl).toBe("https://api.xendit.co/v2/invoices");
    expect(requestBody).toMatchObject({
      external_id: "INV-XEN-CO-1",
      amount: 75000,
      currency: "IDR",
      payer_email: "customer@example.com",
      success_redirect_url: "https://merchant.example/return",
      payment_methods: ["QRIS", "BCA", "BNI", "BRI", "MANDIRI", "PERMATA", "OVO", "DANA", "LINKAJA", "SHOPEEPAY"],
    });
    expect(result).toMatchObject({
      provider: "xendit",
      orderId: "INV-XEN-CO-1",
      gatewayOrderId: "inv_123",
      checkoutUrl: "https://checkout.xendit.co/web/inv_123",
    });
  });
});

describe("duitkuAdapter.createPayment", () => {
  test("wraps QRIS inquiry in the normalized PaymentResult shape", async () => {
    globalThis.fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      statusCode: "00",
      merchantOrderId: "INV-DUITKU-QR-1",
      reference: "DUITKU-REF-1",
      qrString: "000201010212-duitku",
      paymentUrl: "https://sandbox.duitku.com/topup/topupdirectv2.aspx?ref=DUITKU-REF-1",
    })) as typeof fetch;

    const result = await duitkuAdapter.createPayment(
      { method: "qris", orderId: "INV-DUITKU-QR-1", amount: 50000, customerEmail: "customer@example.com" },
      {
        merchantCode: "DS123",
        merchantKey: "merchant-key",
        returnUrl: "https://merchant.example/return",
        callbackUrl: "https://merchant.example/webhooks/duitku",
        sandbox: true,
      },
    );

    expect(result).toMatchObject({
      provider: "duitku",
      method: "qris",
      orderId: "INV-DUITKU-QR-1",
      gatewayOrderId: "INV-DUITKU-QR-1",
      gatewayTransactionId: "DUITKU-REF-1",
      status: "pending",
      qrisString: "000201010212-duitku",
      paymentUrl: "https://sandbox.duitku.com/topup/topupdirectv2.aspx?ref=DUITKU-REF-1",
    });
  });
});

describe("dokuAdapter.createPayment", () => {
  test("wraps SNAP QRIS generation in the normalized PaymentResult shape", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const urls: string[] = [];

    globalThis.fetch = (async (input) => {
      urls.push(String(input));
      if (String(input).includes("/authorization/v1/access-token/b2b")) {
        return jsonResponse({ responseCode: "2007300", accessToken: "doku-token", expiresIn: "900" });
      }
      return jsonResponse({
        responseCode: "2004700",
        partnerReferenceNo: "INV-DOKU-QR-1",
        referenceNo: "DOKU-REF-1",
        qrContent: "000201010212-doku",
      });
    }) as typeof fetch;

    const result = await dokuAdapter.createPayment(
      { method: "qris", orderId: "INV-DOKU-QR-1", amount: 50000 },
      {
        clientId: "BRN-TEST-UNIQUE-DOKU-PAYMENT",
        clientSecret: "doku-secret",
        privateKey: pem,
        merchantId: "47435",
        terminalId: "A01",
        sandbox: true,
      },
    );

    expect(urls).toEqual([
      "https://api-sandbox.doku.com/authorization/v1/access-token/b2b",
      "https://api-sandbox.doku.com/snap-adapter/b2b/v1.0/qr/qr-mpm-generate",
    ]);
    expect(result).toMatchObject({
      provider: "doku",
      method: "qris",
      orderId: "INV-DOKU-QR-1",
      gatewayOrderId: "INV-DOKU-QR-1",
      gatewayTransactionId: "DOKU-REF-1",
      status: "pending",
      qrisString: "000201010212-doku",
    });
  });
});
