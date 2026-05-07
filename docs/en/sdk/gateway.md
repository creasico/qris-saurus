# Gateway Integration

English | [Indonesian](../../sdk/gateway.md)

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

Gateways such as Midtrans, Xendit, and Duitku provide endpoints for creating new QR codes on their servers. The resulting QR already has expiry metadata, is tied to a gateway order ID, and can be monitored for status.

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

Duitku uses a general transaction flow that can generate a payment URL or QR for QRIS.

- Requires: Merchant Code + Merchant Key
- Expiry: controlled via `expiryPeriod`
- Callback: via `callbackUrl`
- Signature note: uses MD5 because of the upstream API requirement

### ShopeePay & GoPay

ShopeePay and GoPay do not currently expose a broadly available public standalone API for dynamic QRIS to ordinary merchants. For notification and expiry support, use an aggregator such as Midtrans.

---

## Available adapters

Each gateway exposes an adapter from `qris-saurus`:

- `midtransAdapter`
- `xenditAdapter`
- `duitkuAdapter`

### Types

```ts
interface MidtransConfig { serverKey: string; sandbox?: boolean; }
interface XenditConfig { secretKey: string; }
interface DuitkuConfig { merchantCode: string; merchantKey: string; sandbox?: boolean; }

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

const duitkuQr = await duitkuAdapter.createDynamicQr(
  { orderId: "INV-2026-001", amount: 75_000, customerEmail: "u@example.com" },
  { merchantCode: process.env.DUITKU_CODE!, merchantKey: process.env.DUITKU_KEY! },
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

Each adapter provides a `verifyWebhook` method to validate that incoming notifications really come from the gateway. Midtrans also exposes `parseWebhook()` and `getWebhookStatus()` so consumers do not need to duplicate Midtrans-specific status normalization.

## Payment status polling

If you cannot receive webhooks, use `pollPaymentStatus` to poll until the payment reaches a terminal state.

Terminal statuses: **paid**, **expired**, **failed**, **cancelled**.

## Official API references

| Gateway  | API docs                                             |
| -------- | ---------------------------------------------------- |
| Midtrans | https://docs.midtrans.com/reference/qris             |
| Xendit   | https://developers.xendit.co/api-reference/#qr-codes |
| Duitku   | https://docs.duitku.com                              |
