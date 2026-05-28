import { afterEach, describe, expect, test } from "bun:test";
import { MidtransAdapter, midtransAdapter } from "../../../src/providers/adapters/midtrans";

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init: RequestInit) => unknown) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = handler(String(input), init ?? {});
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("midtransAdapter.capabilities", () => {
  test("declares production-supported multi-method capabilities", () => {
    expect(midtransAdapter.capabilities()).toEqual({
      qris: true,
      virtualAccount: { banks: ["bca", "bni", "bri", "permata", "cimb"] },
      ewallet: { channels: ["gopay", "shopeepay"] },
      hostedCheckout: true,
    });
  });
});

describe("MidtransAdapter.createPayment", () => {
  const adapter = new MidtransAdapter();
  const config = { serverKey: "SB-Mid-server-test", sandbox: true };

  test("creates a BCA virtual account charge with the documented Core API payload", async () => {
    let requestBody: Record<string, unknown> | undefined;
    let requestUrl = "";
    mockFetch((url, init) => {
      requestUrl = url;
      requestBody = JSON.parse(String(init.body));
      return {
        status_code: "201",
        transaction_status: "pending",
        transaction_id: "tx-va-1",
        order_id: "INV-VA-1",
        gross_amount: "50000.00",
        va_numbers: [{ bank: "bca", va_number: "1234567890" }],
        expiry_time: "2026-05-06 21:32:50",
      };
    });

    const result = await adapter.createPayment(
      {
        method: "virtual_account",
        orderId: "INV-VA-1",
        amount: 50000,
        bank: "bca",
        customerName: "Syakirin Amin",
        customerEmail: "akrinmin@gmail.com",
      },
      config,
    );

    expect(requestUrl).toBe("https://api.sandbox.midtrans.com/v2/charge");
    expect(requestBody).toMatchObject({
      payment_type: "bank_transfer",
      transaction_details: { order_id: "INV-VA-1", gross_amount: 50000 },
      bank_transfer: { bank: "bca" },
      customer_details: { first_name: "Syakirin Amin", email: "akrinmin@gmail.com" },
    });
    expect(result).toMatchObject({
      provider: "midtrans",
      method: "virtual_account",
      orderId: "INV-VA-1",
      gatewayOrderId: "INV-VA-1",
      gatewayTransactionId: "tx-va-1",
      status: "pending",
      bank: "bca",
      vaNumber: "1234567890",
    });
  });

  test("creates a GoPay e-wallet charge with callback URL", async () => {
    let requestBody: Record<string, unknown> | undefined;
    mockFetch((_url, init) => {
      requestBody = JSON.parse(String(init.body));
      return {
        status_code: "201",
        transaction_status: "pending",
        transaction_id: "tx-ewallet-1",
        order_id: "INV-EW-1",
        gross_amount: "50000.00",
        actions: [
          { name: "deeplink-redirect", method: "GET", url: "gojek://gopay/merchanttransfer?t=1" },
          { name: "generate-qr-code", method: "GET", url: "https://api.sandbox.midtrans.com/v2/gopay/qr" },
        ],
      };
    });

    const result = await adapter.createPayment(
      {
        method: "ewallet",
        orderId: "INV-EW-1",
        amount: 50000,
        channel: "gopay",
        callbackUrl: "https://merchant.test/payments/callback",
      },
      config,
    );

    expect(requestBody).toMatchObject({
      payment_type: "gopay",
      transaction_details: { order_id: "INV-EW-1", gross_amount: 50000 },
      gopay: {
        enable_callback: true,
        callback_url: "https://merchant.test/payments/callback",
      },
    });
    expect(result).toMatchObject({
      provider: "midtrans",
      method: "ewallet",
      channel: "gopay",
      deeplinkUrl: "gojek://gopay/merchanttransfer?t=1",
      paymentUrl: "gojek://gopay/merchanttransfer?t=1",
      qrImageUrl: "https://api.sandbox.midtrans.com/v2/gopay/qr",
    });
  });
});

describe("MidtransAdapter.createCheckout", () => {
  test("creates a Snap hosted checkout and forwards notification override headers", async () => {
    const adapter = new MidtransAdapter();
    let requestHeaders: Headers | undefined;
    let requestBody: Record<string, unknown> | undefined;
    mockFetch((_url, init) => {
      requestHeaders = new Headers(init.headers);
      requestBody = JSON.parse(String(init.body));
      return {
        token: "snap-token-1",
        redirect_url: "https://app.sandbox.midtrans.com/snap/v3/redirection/snap-token-1",
      };
    });

    const result = await adapter.createCheckout(
      {
        orderId: "INV-SNAP-1",
        amount: 75000,
        enabledMethods: ["qris", "virtual_account", "ewallet"],
        customerEmail: "akrinmin@gmail.com",
      },
      { serverKey: "SB-Mid-server-test", sandbox: true },
      { overrideNotificationUrl: "https://merchant.test/webhooks/midtrans" },
    );

    expect(requestHeaders?.get("x-override-notification")).toBe("https://merchant.test/webhooks/midtrans");
    expect(requestBody).toMatchObject({
      transaction_details: { order_id: "INV-SNAP-1", gross_amount: 75000 },
      customer_details: { email: "akrinmin@gmail.com" },
      enabled_payments: ["qris", "bank_transfer", "gopay", "shopeepay"],
    });
    expect(result).toMatchObject({
      provider: "midtrans",
      orderId: "INV-SNAP-1",
      gatewayOrderId: "INV-SNAP-1",
      token: "snap-token-1",
      checkoutUrl: "https://app.sandbox.midtrans.com/snap/v3/redirection/snap-token-1",
    });
  });
});
