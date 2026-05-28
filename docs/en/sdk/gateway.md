# Gateway Integration

English | [Bahasa Indonesia](../../sdk/gateway.md)

This document explains the difference between **local transform** and **gateway APIs**, when to use each, and how to use the available gateway adapters.

---

## Core differences

| Aspect               | Local transform                  | Gateway API                      |
| -------------------- | -------------------------------- | -------------------------------- |
| Internet connection  | Not required                     | Required                         |
| Expiry time          | None (QR stays valid indefinitely) | Available (controlled by gateway) |
| Payment notification | None                             | Webhook from gateway             |
| Reconciliation       | Manual                           | Via gateway dashboard            |
| Refund               | Not available                    | Available on some gateways       |
| Generation speed     | Immediate (sync)                 | Depends on API latency           |
| Best for             | Merchant already has static QRIS | New checkout systems via gateway |

---

## Local transform — how it works

The library reads an existing static QRIS payload, modifies it locally, and returns a new valid string. Everything happens in memory, with no server I/O.

## Gateway API — how it works

Gateways such as Midtrans, Xendit, Duitku, and DOKU provide endpoints for creating new QR codes on their servers. The resulting QR already has expiry metadata, is tied to a gateway order ID, and can be monitored for status.

`qris-saurus` provides ready-to-use adapters for these gateways.

## Provider API overview

### Midtrans

Midtrans provides an official endpoint for dynamic QRIS through the Core API.

- Requires: Server Key
- Expiry: controlled by Midtrans
- Webhook: supports notifications

### Xendit

Xendit supports QRIS through the QR Codes API.

- Requires: Secret Key
- Expiry: available in the response
- Refund: available via API

### Duitku

Duitku Direct API generates QRIS through the inquiry endpoint with HMAC-SHA256 signatures.

- Requires: Merchant Code + API key as `merchantKey`
- Expiry: controlled via `expiryPeriod` when sent
- Callback: via `callbackUrl`, signed with HMAC-SHA256

### DOKU

DOKU uses SNAP QRIS MPM: obtain a B2B access token with RSA-SHA256, then generate/query QRIS with a Bearer token and HMAC-SHA512 signatures.

- Requires: Client ID, Client Secret, Private Key, Merchant ID, Terminal ID
- Token: B2B access tokens are cached until shortly before expiry
- Webhook: SNAP HMAC-SHA512 signature over the callback path and raw body

### ShopeePay & GoPay

ShopeePay and GoPay do not currently expose a broadly available public standalone API for dynamic QRIS to ordinary merchants. For notification and expiry support, use an aggregator such as Midtrans.

---

## Available adapters

Each gateway exposes an adapter from `qris-saurus`:

- `midtransAdapter`
- `xenditAdapter`
- `duitkuAdapter`
- `dokuAdapter`

### Types

```ts
interface MidtransConfig { serverKey: string; sandbox?: boolean; }
interface XenditConfig { secretKey: string; }
interface DuitkuConfig { merchantCode: string; merchantKey: string; returnUrl: string; callbackUrl: string; sandbox?: boolean; }
interface DokuConfig { clientId: string; clientSecret: string; privateKey: string; merchantId: string; terminalId: string; sandbox?: boolean; webhookPath?: string; }

interface ApiQrCreateOptions {
  orderId: string;
  amount: number;
  description?: string;
  customerEmail?: string;
}

interface ApiQrResult {
  qrisString: string;       // raw EMV QRIS payload for local rendering
  gatewayOrderId: string;
  expiresAt?: Date;
  qrImageUrl?: string;      // PNG URL returned by the gateway, if available
  qrImageUrlV2?: string;    // alternate PNG variant, e.g. bordered/ASPI
  gatewayTransactionId?: string;
  acquirer?: string;
  paymentType?: string;
  raw: unknown;
}

type PaymentStatusCode = "pending" | "paid" | "refunded" | "expired" | "failed" | "cancelled";

interface PaymentStatusResult {
  orderId: string;
  status: PaymentStatusCode;
  amount?: number;
  paidAt?: Date;
  raw: unknown;
}
```

### Usage

```ts
import {
  midtransAdapter,
  xenditAdapter,
  duitkuAdapter,
  dokuAdapter,
  renderQrToDataUrl,
} from "qris-saurus";

const midtransQr = await midtransAdapter.createDynamicQr(
  { orderId: "INV-2026-001", amount: 75_000 },
  { serverKey: process.env.MIDTRANS_SERVER_KEY!, sandbox: true },
  { overrideNotificationUrl: "https://merchant.example/webhooks/midtrans" },
);
console.log(midtransQr.qrisString);   // raw QRIS payload
console.log(midtransQr.qrImageUrl);   // PNG URL when Midtrans provides one
console.log(midtransQr.qrImageUrlV2); // alternate bordered PNG URL

const xenditQr = await xenditAdapter.createDynamicQr(
  { orderId: "INV-2026-001", amount: 75_000 },
  { secretKey: process.env.XENDIT_SECRET_KEY! },
);

const duitkuConfig = {
  merchantCode: process.env.DUITKU_CODE!,
  merchantKey: process.env.DUITKU_KEY!,
  returnUrl: "https://merchant.example/return",
  callbackUrl: "https://merchant.example/webhooks/duitku",
};
const duitkuQr = await duitkuAdapter.createDynamicQr(
  { orderId: "INV-2026-001", amount: 75_000, customerEmail: "u@example.com" },
  duitkuConfig,
);

const dokuConfig = {
  clientId: process.env.DOKU_CLIENT_ID!,
  clientSecret: process.env.DOKU_CLIENT_SECRET!,
  privateKey: process.env.DOKU_PRIVATE_KEY!,
  merchantId: process.env.DOKU_MERCHANT_ID!,
  terminalId: process.env.DOKU_TERMINAL_ID!,
  webhookPath: "/webhooks/doku",
  sandbox: true,
};
const dokuQr = await dokuAdapter.createDynamicQr(
  { orderId: "INV-2026-001", amount: 75_000 },
  dokuConfig,
);

const image = await renderQrToDataUrl(midtransQr.qrisString);
```

---

## When to use which approach?

Use local transform when:
- you already have a static QRIS payload
- you only need to attach the amount
- you do not need gateway-managed expiry or notifications

Use gateway APIs when:
- you need expiry, callbacks, or status tracking
- the provider requires server-side QR generation
- you want reconciliation tied to the gateway

---

## Gateway credential security

Gateway credentials must never be exposed in the frontend or bundled into client code. Store them in:

- backend environment variables
- a secret manager
- a backend service acting as the integration layer

## Webhook verification

Each adapter provides webhook verification helpers to validate that incoming notifications really come from the gateway. Midtrans exposes `parseWebhook()` and `getWebhookStatus()` for status normalization. Duitku and DOKU `parseWebhook()` throw by default on invalid signatures; pass `{ throwOnInvalid: false }` only when you want a safe `valid: false` result. For DOKU, pass `rawBody` whenever your framework exposes it so the signed body hash matches the original request.

## Payment status polling

If you cannot receive webhooks, use `pollPaymentStatus` to poll until the payment reaches a terminal state.

Terminal statuses: **paid**, **expired**, **failed**, **cancelled**.

## Official API references

| Gateway  | API docs                                             |
| -------- | ---------------------------------------------------- |
| Midtrans | https://docs.midtrans.com/reference/qris             |
| Xendit   | https://developers.xendit.co/api-reference/#qr-codes |
| Duitku   | https://docs.duitku.com                              |
| DOKU     | https://developers.doku.com                          |
