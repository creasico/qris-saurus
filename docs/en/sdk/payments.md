# Gateway Payments

English | [Bahasa Indonesia](../../sdk/payments.md)

This document explains the multi-method gateway direction in `qris-saurus`: **direct payments** for merchant-owned UI and **hosted checkout** for provider-owned UI.

## Production Principles

- Provider webhooks are the source of truth for `paid`, not browser redirects or frontend polling.
- Always verify provider webhook signatures/tokens before updating orders.
- The SDK does not ship a payment UI; it normalizes provider requests and responses.
- Use `createPayment()` for direct API/custom UI payments.
- Use `createCheckout()` for provider-hosted payment pages.
- Store `gatewayOrderId`/provider references for status checks and reconciliation.

## Direct Payment vs Hosted Checkout

| Flow | Payment UI owner | Method | Main return value | Use case |
| --- | --- | --- | --- | --- |
| Direct payment | Your merchant app | `gateway.createPayment()` | `qrisString`, `vaNumber`, `deeplinkUrl`, `paymentUrl` | Custom checkout, POS, mobile apps |
| Hosted checkout | Provider | `gateway.createCheckout()` | `checkoutUrl` | Fast integration, provider displays method selection |

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

## Current Support

| Provider | Direct QRIS | Direct VA | Direct e-wallet | Hosted checkout | Webhook verification |
| --- | --- | --- | --- | --- | --- |
| Midtrans | Yes | BCA, BNI, BRI, Permata, CIMB | GoPay, ShopeePay | Snap redirect | SHA512 notification signature |
| Xendit | Yes | Not yet in this adapter | Not yet in this adapter | Not yet in this adapter | Callback token |
| Duitku | Yes | Not yet in this adapter | Not yet in this adapter | Not yet in this adapter | HMAC-SHA256 callback signature |
| DOKU | Yes | Not yet in this adapter | Not yet in this adapter | Not yet in this adapter | SNAP signature + timestamp window |

Note: Xendit, Duitku, and DOKU expose VA/e-wallet/hosted UI products in their official docs, but `qris-saurus` only enables direct QRIS for those providers until each method-specific request/response and webhook flow is implemented with dedicated tests.

## Provider Documentation References

- Midtrans Core API: `POST /v2/charge` for direct payments, including QRIS, VA, GoPay, and ShopeePay.
- Midtrans Snap: `POST /snap/v1/transactions` for hosted checkout (`redirect_url`).
- Xendit: Payment Request API `POST /v3/payment_requests`, Payment Links, and callback token.
- Duitku: V2 for custom payment pages and POP for hosted payment selection; create invoice uses HMAC-SHA256 header signature.
- DOKU: DOKU Checkout for hosted payment pages and Direct API/SNAP for direct payments; notifications must be verified with the official signature.
