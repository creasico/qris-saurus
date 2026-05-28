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
    expect(duitkuAdapter.capabilities()).toEqual({
      qris: true,
      virtualAccount: { banks: ["bca", "bni", "bri", "mandiri", "permata", "cimb"] },
      ewallet: { channels: ["ovo", "shopeepay", "dana", "linkaja"] },
    });
    expect(dokuAdapter.capabilities()).toEqual({
      qris: true,
      virtualAccount: { banks: ["bca", "bni", "bri", "mandiri", "permata", "cimb"] },
      ewallet: { channels: ["dana", "shopeepay"] },
    });
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
  test("creates a Duitku BCA Virtual Account with normalized result", async () => {
    let requestBody: Record<string, any> | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({
        statusCode: "00",
        merchantCode: "DS123",
        reference: "DUITKU-VA-REF-1",
        paymentUrl: "https://sandbox.duitku.com/topup/topupdirectv2.aspx?ref=DUITKU-VA-REF-1",
        vaNumber: "7007014001444348",
        amount: 50000,
      });
    }) as typeof fetch;

    const result = await duitkuAdapter.createPayment(
      {
        method: "virtual_account",
        bank: "bca",
        orderId: "INV-DUITKU-VA-1",
        amount: 50000,
        customerName: "Amin",
        customerEmail: "amin@example.com",
      },
      {
        merchantCode: "DS123",
        merchantKey: "merchant-key",
        returnUrl: "https://merchant.example/return",
        callbackUrl: "https://merchant.example/webhooks/duitku",
        sandbox: true,
      },
    );

    expect(requestBody).toMatchObject({
      merchantCode: "DS123",
      paymentAmount: 50000,
      paymentMethod: "BC",
      merchantOrderId: "INV-DUITKU-VA-1",
      customerVaName: "Amin",
      email: "amin@example.com",
      callbackUrl: "https://merchant.example/webhooks/duitku",
      returnUrl: "https://merchant.example/return",
    });
    expect(result).toMatchObject({
      provider: "duitku",
      method: "virtual_account",
      bank: "bca",
      orderId: "INV-DUITKU-VA-1",
      gatewayOrderId: "INV-DUITKU-VA-1",
      gatewayTransactionId: "DUITKU-VA-REF-1",
      status: "pending",
      amount: 50000,
      vaNumber: "7007014001444348",
      paymentUrl: "https://sandbox.duitku.com/topup/topupdirectv2.aspx?ref=DUITKU-VA-REF-1",
    });
  });

  test("creates a Duitku DANA e-wallet payment with normalized redirect result", async () => {
    let requestBody: Record<string, any> | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return jsonResponse({
        statusCode: "00",
        merchantCode: "DS123",
        reference: "DUITKU-DANA-REF-1",
        paymentUrl: "https://sandbox.duitku.com/topup/topupdirectv2.aspx?ref=DUITKU-DANA-REF-1",
        appUrl: "https://app-sandbox.duitku.com/redirect_checkout?reference=DUITKU-DANA-REF-1",
        amount: 50000,
      });
    }) as typeof fetch;

    const result = await duitkuAdapter.createPayment(
      {
        method: "ewallet",
        channel: "dana",
        orderId: "INV-DUITKU-DANA-1",
        amount: 50000,
        customerEmail: "customer@example.com",
        customerPhone: "08123456789",
      },
      {
        merchantCode: "DS123",
        merchantKey: "merchant-key",
        returnUrl: "https://merchant.example/return",
        callbackUrl: "https://merchant.example/webhooks/duitku",
        sandbox: true,
      },
    );

    expect(requestBody).toMatchObject({
      merchantCode: "DS123",
      paymentAmount: 50000,
      paymentMethod: "DA",
      merchantOrderId: "INV-DUITKU-DANA-1",
      phoneNumber: "08123456789",
    });
    expect(result).toMatchObject({
      provider: "duitku",
      method: "ewallet",
      channel: "dana",
      orderId: "INV-DUITKU-DANA-1",
      gatewayTransactionId: "DUITKU-DANA-REF-1",
      paymentUrl: "https://app-sandbox.duitku.com/redirect_checkout?reference=DUITKU-DANA-REF-1",
      deeplinkUrl: "https://app-sandbox.duitku.com/redirect_checkout?reference=DUITKU-DANA-REF-1",
    });
  });

  test("rejects Duitku e-wallet channels without a direct payment method mapping", async () => {
    await expect(duitkuAdapter.createPayment(
      {
        method: "ewallet",
        channel: "gopay",
        orderId: "INV-DUITKU-GOPAY-1",
        amount: 50000,
      },
      {
        merchantCode: "DS123",
        merchantKey: "merchant-key",
        returnUrl: "https://merchant.example/return",
        callbackUrl: "https://merchant.example/webhooks/duitku",
        sandbox: true,
      },
    )).rejects.toThrow(/gopay e-wallet direct payment is not supported/);
  });

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
  test("creates DOKU SNAP Virtual Account with normalized result", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const urls: string[] = [];
    let createVaBody: Record<string, any> | undefined;

    globalThis.fetch = (async (input, init) => {
      urls.push(String(input));
      if (String(input).includes("/authorization/v1/access-token/b2b")) {
        return jsonResponse({ responseCode: "2007300", accessToken: "doku-token", expiresIn: "900" });
      }
      createVaBody = JSON.parse(String(init?.body));
      return jsonResponse({
        responseCode: "2002700",
        responseMessage: "Successful",
        virtualAccountData: {
          partnerServiceId: "   19008",
          customerNo: "0",
          virtualAccountNo: "   190080",
          virtualAccountName: "Amin",
          trxId: "INV-DOKU-VA-1",
          totalAmount: { value: "50000.00", currency: "IDR" },
          expiredDate: "2026-05-07T10:00:00+07:00",
          additionalInfo: {
            channel: "VIRTUAL_ACCOUNT_BCA",
            howToPayPage: "https://app.doku.com/how-to-pay/virtual-account/bca/190080/ref",
          },
        },
      });
    }) as typeof fetch;

    const result = await dokuAdapter.createPayment(
      {
        method: "virtual_account",
        orderId: "INV-DOKU-VA-1",
        amount: 50000,
        bank: "bca",
        customerName: "Amin",
        customerEmail: "amin@example.com",
      },
      {
        clientId: "BRN-TEST-UNIQUE-DOKU-VA",
        clientSecret: "doku-secret",
        privateKey: pem,
        merchantId: "47435",
        terminalId: "A01",
        virtualAccountPartnerServiceId: "19008",
        sandbox: true,
      },
    );

    expect(urls).toEqual([
      "https://api-sandbox.doku.com/authorization/v1/access-token/b2b",
      "https://api-sandbox.doku.com/virtual-accounts/bi-snap-va/v1.1/transfer-va/create-va",
    ]);
    expect(createVaBody).toMatchObject({
      partnerServiceId: "   19008",
      customerNo: "0",
      virtualAccountNo: "   190080",
      virtualAccountName: "Amin",
      virtualAccountEmail: "amin@example.com",
      trxId: "INV-DOKU-VA-1",
      totalAmount: { value: "50000.00", currency: "IDR" },
      additionalInfo: { channel: "VIRTUAL_ACCOUNT_BCA" },
      virtualAccountTrxType: "C",
    });
    expect(result).toMatchObject({
      provider: "doku",
      method: "virtual_account",
      orderId: "INV-DOKU-VA-1",
      gatewayOrderId: "INV-DOKU-VA-1",
      status: "pending",
      amount: 50000,
      bank: "bca",
      vaNumber: "190080",
      paymentUrl: "https://app.doku.com/how-to-pay/virtual-account/bca/190080/ref",
    });
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  test("requires DOKU VA partner service ID before creating virtual account", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    await expect(dokuAdapter.createPayment(
      { method: "virtual_account", orderId: "INV-DOKU-VA-ERR", amount: 50000, bank: "bca" },
      {
        clientId: "BRN-TEST-UNIQUE-DOKU-VA-ERR",
        clientSecret: "doku-secret",
        privateKey: pem,
        merchantId: "47435",
        terminalId: "A01",
        sandbox: true,
      },
    )).rejects.toThrow(/virtualAccountPartnerServiceId/);
  });

  test("checks DOKU Virtual Account status through the SNAP status endpoint", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const urls: string[] = [];
    let statusBody: Record<string, any> | undefined;

    globalThis.fetch = (async (input, init) => {
      urls.push(String(input));
      if (String(input).includes("/authorization/v1/access-token/b2b")) {
        return jsonResponse({ responseCode: "2007300", accessToken: "doku-token-status", expiresIn: "900" });
      }
      statusBody = JSON.parse(String(init?.body));
      return jsonResponse({
        responseCode: "2002600",
        responseMessage: "Successful",
        virtualAccountData: {
          trxId: "INV-DOKU-VA-PAID",
          virtualAccountNo: "   1900800001",
          paidAmount: { value: "50000.00", currency: "IDR" },
        },
        additionalInfo: {
          channel: "VIRTUAL_ACCOUNT_BCA",
        },
      });
    }) as typeof fetch;

    const result = await dokuAdapter.checkVirtualAccountStatus(
      {
        partnerServiceId: "19008",
        customerNo: "00001",
        virtualAccountNo: "   1900800001",
      },
      {
        clientId: "BRN-TEST-UNIQUE-DOKU-VA-STATUS",
        clientSecret: "doku-secret",
        privateKey: pem,
        merchantId: "47435",
        terminalId: "A01",
        sandbox: true,
      },
    );

    expect(urls).toEqual([
      "https://api-sandbox.doku.com/authorization/v1/access-token/b2b",
      "https://api-sandbox.doku.com/orders/v1.0/transfer-va/status",
    ]);
    expect(statusBody).toMatchObject({
      partnerServiceId: "   19008",
      customerNo: "00001",
      virtualAccountNo: "   1900800001",
      additionalInfo: {},
    });
    expect(result).toMatchObject({
      provider: "doku",
      method: "virtual_account",
      orderId: "INV-DOKU-VA-PAID",
      status: "paid",
      amount: 50000,
      bank: "bca",
      vaNumber: "1900800001",
    });
  });

  test("creates DOKU SNAP DANA e-wallet payment with normalized redirect result", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const urls: string[] = [];
    let paymentBody: Record<string, any> | undefined;

    globalThis.fetch = (async (input, init) => {
      urls.push(String(input));
      if (String(input).includes("/authorization/v1/access-token/b2b")) {
        return jsonResponse({ responseCode: "2007300", accessToken: "doku-ewallet-token", expiresIn: "900" });
      }
      paymentBody = JSON.parse(String(init?.body));
      return jsonResponse({
        responseCode: "2000500",
        responseMessage: "Successful",
        webRedirectUrl: "https://app-uat.doku.com/link/283702597342040",
        partnerReferenceNo: "INV-DOKU-DANA-1",
      });
    }) as typeof fetch;

    const expiresAt = new Date("2026-05-07T03:00:00.000Z");
    const result = await dokuAdapter.createPayment(
      {
        method: "ewallet",
        channel: "dana",
        orderId: "INV-DOKU-DANA-1",
        amount: 50000,
        returnUrl: "https://merchant.example/return",
        description: "Sepatu",
        expiresAt,
      },
      {
        clientId: "BRN-TEST-UNIQUE-DOKU-DANA",
        clientSecret: "doku-secret",
        privateKey: pem,
        merchantId: "47435",
        terminalId: "A01",
        sandbox: true,
      },
    );

    expect(urls).toEqual([
      "https://api-sandbox.doku.com/authorization/v1/access-token/b2b",
      "https://api-sandbox.doku.com/direct-debit/core/v1/debit/payment-host-to-host",
    ]);
    expect(paymentBody).toMatchObject({
      partnerReferenceNo: "INV-DOKU-DANA-1",
      validUpTo: "2026-05-07T03:00:00.000Z",
      pointOfInitiation: "app",
      urlParam: {
        url: "https://merchant.example/return",
        type: "PAY_RETURN",
        isDeepLink: "N",
      },
      amount: { value: "50000.00", currency: "IDR" },
      additionalInfo: {
        channel: "EMONEY_DANA_SNAP",
        orderTitle: "Sepatu",
      },
    });
    expect(result).toMatchObject({
      provider: "doku",
      method: "ewallet",
      channel: "dana",
      orderId: "INV-DOKU-DANA-1",
      gatewayOrderId: "INV-DOKU-DANA-1",
      status: "pending",
      amount: 50000,
      paymentUrl: "https://app-uat.doku.com/link/283702597342040",
      deeplinkUrl: "https://app-uat.doku.com/link/283702597342040",
      expiresAt,
    });
  });

  test("rejects DOKU e-wallet channels that require a separate binding flow", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    await expect(dokuAdapter.createPayment(
      {
        method: "ewallet",
        channel: "ovo",
        orderId: "INV-DOKU-OVO-1",
        amount: 50000,
        returnUrl: "https://merchant.example/return",
      },
      {
        clientId: "BRN-TEST-UNIQUE-DOKU-OVO",
        clientSecret: "doku-secret",
        privateKey: pem,
        merchantId: "47435",
        terminalId: "A01",
        sandbox: true,
      },
    )).rejects.toThrow(/ovo e-wallet direct payment is not supported/);
  });

  test("checks DOKU e-wallet status through the SNAP debit status endpoint", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const urls: string[] = [];
    let statusBody: Record<string, any> | undefined;

    globalThis.fetch = (async (input, init) => {
      urls.push(String(input));
      if (String(input).includes("/authorization/v1/access-token/b2b")) {
        return jsonResponse({ responseCode: "2007300", accessToken: "doku-ewallet-status-token", expiresIn: "900" });
      }
      statusBody = JSON.parse(String(init?.body));
      return jsonResponse({
        responseCode: "2005500",
        responseMessage: "Successful",
        originalPartnerReferenceNo: "INV-DOKU-SPAY-PAID",
        originalReferenceNo: "DOKU-SPAY-REF-1",
        serviceCode: "55",
        latestTransactionStatus: "00",
        transactionStatusDesc: "SUCCESS",
        transAmount: { value: "50000.00", currency: "IDR" },
        paidTime: "2026-05-07T10:00:05+07:00",
        additionalInfo: { acquirer: { id: "EMONEY_SHOPEE_PAY_SNAP" } },
      });
    }) as typeof fetch;

    const result = await dokuAdapter.checkEwalletStatus(
      {
        orderId: "INV-DOKU-SPAY-PAID",
        amount: 50000,
        channel: "shopeepay",
        transactionDate: "2026-05-07T10:00:00+07:00",
      },
      {
        clientId: "BRN-TEST-UNIQUE-DOKU-SPAY-STATUS",
        clientSecret: "doku-secret",
        privateKey: pem,
        merchantId: "47435",
        terminalId: "A01",
        sandbox: true,
      },
    );

    expect(urls).toEqual([
      "https://api-sandbox.doku.com/authorization/v1/access-token/b2b",
      "https://api-sandbox.doku.com/orders/v1.0/debit/status",
    ]);
    expect(statusBody).toMatchObject({
      originalPartnerReferenceNo: "INV-DOKU-SPAY-PAID",
      serviceCode: "55",
      transactionDate: "2026-05-07T10:00:00+07:00",
      amount: { value: "50000.00", currency: "IDR" },
      merchantId: "47435",
      additionalInfo: { channel: "EMONEY_SHOPEE_PAY_SNAP" },
    });
    expect(result).toMatchObject({
      provider: "doku",
      method: "ewallet",
      channel: "shopeepay",
      orderId: "INV-DOKU-SPAY-PAID",
      gatewayTransactionId: "DOKU-SPAY-REF-1",
      status: "paid",
      amount: 50000,
    });
    expect(result.paidAt).toBeInstanceOf(Date);
  });

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
