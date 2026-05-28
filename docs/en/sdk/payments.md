# Gateway Payments

English | [Bahasa Indonesia](../../sdk/payments.md)

This document explains the multi-method gateway direction in `qris-saurus`: **direct payments** for merchant-owned UI and **hosted checkout** for provider-owned UI.

## Production Principles

- Provider webhooks are the source of truth for `paid`, not browser redirects or frontend polling.
- Always verify provider webhook signatures/tokens before updating orders.
- The SDK does not ship a payment UI; it normalizes provider requests and responses.
- Use `createPayment()` for direct API/custom UI payments.
- Use typed helpers `createQrisPayment()`, `createVirtualAccount()`, and `createEwallet()` for more specific input/output types.
- Use `createCheckout()` or the `createHostedCheckout()` alias for provider-hosted payment pages.
- Store `gatewayOrderId`/provider references for status checks and reconciliation.

## Direct Payment vs Hosted Checkout

| Flow | Payment UI owner | Method | Main return value | Use case |
| --- | --- | --- | --- | --- |
| Direct payment | Your merchant/app UI | `gateway.createPayment()` or typed helpers | `qrisString`, `vaNumber`, `deeplinkUrl`, `paymentUrl` | Custom checkout, POS, mobile app |
| Hosted checkout | Provider | `gateway.createCheckout()` / `gateway.createHostedCheckout()` | `checkoutUrl` | Fast integration, provider shows payment choices |

Safe flow:

```text
Backend creates payment/checkout
        │
        ▼
Frontend displays QRIS / VA / deeplink / checkoutUrl
        │
        ▼
Customer pays
        │
        ▼
Provider sends webhook to backend
        │
        ▼
Backend verifies signature/token
        │
        ▼
Backend updates order paid/failed/expired
```

## Provider Capabilities

Use `gateway.capabilities()` before showing payment methods to users.

```ts
gateway.configure({
  provider: "midtrans",
  serverKey: process.env.MIDTRANS_SERVER_KEY!,
  sandbox: true,
});

const capabilities = gateway.capabilities();
console.log(capabilities.virtualAccount?.banks);
console.log(capabilities.ewallet?.channels);
```

If a method is not supported, `createPayment()` rejects with `ProviderCapabilityError` before sending any request to the provider.

## Typed Helpers

Typed helpers wrap `createPayment()` and `createCheckout()` so TypeScript knows the exact request/result shape.

```ts
const qris = await gateway.createQrisPayment({ orderId: "INV-001", amount: 50_000 });
const va = await gateway.createVirtualAccount({ orderId: "INV-002", amount: 50_000, bank: "bca" });
const ewallet = await gateway.createEwallet({ orderId: "INV-003", amount: 50_000, channel: "gopay" });
const checkout = await gateway.createHostedCheckout({ orderId: "INV-004", amount: 50_000 });

console.log(qris.qrisString);
console.log(va.vaNumber);
console.log(ewallet.deeplinkUrl ?? ewallet.paymentUrl);
console.log(checkout.checkoutUrl);
```

## createPayment()

### QRIS

```ts
const payment = await gateway.createPayment({
  method: "qris",
  orderId: "INV-001",
  amount: 50_000,
  notificationUrl: "https://merchant.example/webhooks/midtrans",
});

if (payment.method === "qris") {
  console.log(payment.qrisString);
  console.log(payment.qrImageUrl);
}
```

### Virtual Account

```ts
const payment = await gateway.createPayment({
  method: "virtual_account",
  orderId: "INV-002",
  amount: 50_000,
  bank: "bca",
  customerName: "Syakirin Amin",
  customerEmail: "akrinmin@gmail.com",
});

if (payment.method === "virtual_account") {
  console.log(payment.bank);
  console.log(payment.vaNumber);
}
```

### E-wallet

```ts
const payment = await gateway.createPayment({
  method: "ewallet",
  orderId: "INV-003",
  amount: 50_000,
  channel: "gopay",
  callbackUrl: "https://merchant.example/payments/callback",
});

if (payment.method === "ewallet") {
  console.log(payment.deeplinkUrl);
  console.log(payment.paymentUrl);
}
```

## createCheckout()

Hosted checkout returns the provider payment page URL. Redirect the user to this URL, but still wait for the webhook before updating the order status.

```ts
const checkout = await gateway.createCheckout({
  orderId: "INV-004",
  amount: 75_000,
  enabledMethods: ["qris", "virtual_account", "ewallet"],
  customerEmail: "customer@example.com",
  notificationUrl: "https://merchant.example/webhooks/midtrans",
});

console.log(checkout.checkoutUrl);
```

## Status and Webhooks

```ts
const status = await gateway.status("INV-004");
console.log(status.status);
```

```ts
const result = gateway.verify(providerPayload, providerHeaders);
if (result.valid && result.status === "paid") {
  // Update the order as paid in your database.
}
```

For providers that require the raw body, such as DOKU SNAP, pass the raw body through the existing webhook options for that provider/adapter.

## Sandbox Smoke Test

The sandbox script is opt-in and does not run in CI by default. It creates real sandbox transactions, so the explicit flag is required.

```bash
RUN_PAYMENT_SANDBOX=true \
SANDBOX_PROVIDER=midtrans \
MIDTRANS_SERVER_KEY=SB-Mid-server-... \
bun run test:sandbox:payments
```

Other providers use their own env config (`XENDIT_SECRET_KEY`, `DUITKU_MERCHANT_CODE`/`DUITKU_MERCHANT_KEY`, or `DOKU_CLIENT_ID`/`DOKU_CLIENT_SECRET`/`DOKU_PRIVATE_KEY`).

## Current Support

| Provider | Direct QRIS | Direct VA | Direct e-wallet | Hosted checkout | Webhook verification |
| --- | --- | --- | --- | --- | --- |
| Midtrans | Yes | BCA, BNI, BRI, Permata, CIMB | GoPay, ShopeePay | Snap redirect | SHA512 notification signature |
| Xendit | Yes | Via hosted invoice | Via hosted invoice | Invoice checkout | Callback token |
| Duitku | Yes | Not yet in this adapter | Not yet in this adapter | Not yet in this adapter | HMAC-SHA256 callback signature |
| DOKU | Yes | BCA, BNI, BRI, Mandiri, Permata, CIMB | Not yet in this adapter | Not yet in this adapter | SNAP signature + timestamp window |

Note: Xendit VA/e-wallet support is intentionally exposed through hosted invoices (`createCheckout()`), not direct `createPayment()`, because direct channel responses and webhooks differ per method. Duitku still exposes direct QRIS only until each non-QRIS request/response and webhook flow is implemented with dedicated tests. DOKU direct VA requires `virtualAccountPartnerServiceId` / `DOKU_VA_PARTNER_SERVICE_ID` from the merchant BIN configuration.

## Provider Documentation References

- Midtrans Core API: `POST /v2/charge` for direct payments, including QRIS, VA, GoPay, and ShopeePay.
- Midtrans Snap: `POST /snap/v1/transactions` for hosted checkout (`redirect_url`).
- Xendit: Payment Request API `POST /v3/payment_requests`, Payment Links, and callback token.
- Duitku: V2 for custom payment pages and POP for hosted payment selection; create invoice uses HMAC-SHA256 header signature.
- DOKU: DOKU Checkout for hosted payment pages and Direct API/SNAP for direct payments; notifications must be verified with the official signature.
