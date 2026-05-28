# Gateway Payments

[English](../en/sdk/payments.md) | Bahasa Indonesia

Dokumen ini menjelaskan arah multi-method gateway di `qris-saurus`: **direct payments** untuk UI milik merchant dan **hosted checkout** untuk UI milik provider.

## Prinsip production

- Webhook provider adalah source of truth untuk status `paid`, bukan redirect browser atau polling frontend.
- Semua webhook harus diverifikasi dengan signature/token provider sebelum order di-update.
- SDK tidak menyediakan UI bawaan; SDK hanya menormalisasi request/response provider.
- Gunakan `createPayment()` untuk pembayaran direct API/custom UI.
- Gunakan helper typed `createQrisPayment()`, `createVirtualAccount()`, dan `createEwallet()` agar input/output lebih spesifik.
- Gunakan `createCheckout()` atau alias `createHostedCheckout()` untuk payment page/hosted UI provider.
- Simpan `gatewayOrderId`/reference provider untuk status check dan reconciliation.

## Direct payment vs hosted checkout

| Flow | Siapa yang menyediakan UI | Method | Return utama | Kapan dipakai |
| --- | --- | --- | --- | --- |
| Direct payment | Merchant/app kamu | `gateway.createPayment()` atau helper typed | `qrisString`, `vaNumber`, `deeplinkUrl`, `paymentUrl` | Checkout custom, POS, app mobile |
| Hosted checkout | Provider | `gateway.createCheckout()` / `gateway.createHostedCheckout()` | `checkoutUrl` | Integrasi cepat, provider menampilkan pilihan metode |

Flow aman:

```text
Backend create payment/checkout
        │
        ▼
Frontend tampilkan QRIS / VA / deeplink / checkoutUrl
        │
        ▼
Customer bayar
        │
        ▼
Provider kirim webhook ke backend
        │
        ▼
Backend verify signature/token
        │
        ▼
Backend update order paid/failed/expired
```

## Capability provider

Gunakan `gateway.capabilities()` sebelum menampilkan payment method ke user.

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

Jika method tidak didukung, `createPayment()` akan menolak request dengan `ProviderCapabilityError` sebelum request dikirim ke provider.

## Helper typed

Helper typed adalah wrapper di atas `createPayment()` dan `createCheckout()` supaya TypeScript langsung tahu bentuk request/result yang tepat.

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

### Virtual account

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

Hosted checkout mengembalikan URL payment page provider. Redirect user ke URL itu, tapi tetap tunggu webhook untuk update status order.

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

## Status dan webhook

```ts
const status = await gateway.status("INV-004");
console.log(status.status);
```

```ts
const result = gateway.verify(providerPayload, providerHeaders);
if (result.valid && result.status === "paid") {
  // Update order paid di database kamu.
}
```

Untuk provider yang membutuhkan raw body (misalnya DOKU SNAP), teruskan raw body melalui opsi webhook yang sudah tersedia di adapter/provider terkait.

## Sandbox smoke test

Script sandbox bersifat opt-in dan tidak berjalan otomatis di CI. Ia membuat transaksi sandbox nyata, jadi wajib set flag eksplisit.

```bash
RUN_PAYMENT_SANDBOX=true \
SANDBOX_PROVIDER=midtrans \
MIDTRANS_SERVER_KEY=SB-Mid-server-... \
bun run test:sandbox:payments
```

Provider lain memakai env config masing-masing (`XENDIT_SECRET_KEY`, `DUITKU_MERCHANT_CODE`/`DUITKU_MERCHANT_KEY`, atau `DOKU_CLIENT_ID`/`DOKU_CLIENT_SECRET`/`DOKU_PRIVATE_KEY`).

## Dukungan saat ini

| Provider | QRIS direct | VA direct | E-wallet direct | Hosted checkout | Webhook verification |
| --- | --- | --- | --- | --- | --- |
| Midtrans | Ya | BCA, BNI, BRI, Permata, CIMB | GoPay, ShopeePay | Snap redirect | SHA512 notification signature |
| Xendit | Ya | Via hosted invoice | Via hosted invoice | Invoice checkout | Callback token |
| Duitku | Ya | BCA, BNI, BRI, Mandiri, Permata, CIMB | OVO, ShopeePay, DANA, LinkAja | Belum di adapter ini | HMAC-SHA256 callback signature |
| DOKU | Ya | BCA, BNI, BRI, Mandiri, Permata, CIMB | DANA, ShopeePay | Belum di adapter ini | SNAP signature + timestamp window |

Catatan: Xendit VA/e-wallet saat ini sengaja dibuka hanya melalui hosted invoice (`createCheckout()`), bukan direct `createPayment()`, karena response dan webhook direct per channel berbeda. Duitku VA dan e-wallet direct memakai Direct API `/v2/inquiry` dengan `paymentMethod` resmi (`BC`, `I1`, `BR`, `M2`, `BT`, `B1`, `OV`, `SA`, `DA`, `LF`) dan callback HMAC-SHA256 yang sama. DOKU VA direct membutuhkan `virtualAccountPartnerServiceId` / `DOKU_VA_PARTNER_SERVICE_ID` dari konfigurasi BIN merchant. DOKU e-wallet direct saat ini hanya mengaktifkan flow redirect DANA dan ShopeePay; OVO tetap guarded karena membutuhkan account binding/tokenization terpisah.

## Referensi dokumentasi provider

- Midtrans Core API: `POST /v2/charge` untuk direct payment, termasuk QRIS, VA, GoPay, dan ShopeePay.
- Midtrans Snap: `POST /snap/v1/transactions` untuk hosted checkout (`redirect_url`).
- Xendit: Payment Request API `POST /v3/payment_requests`, Payment Links, dan callback token.
- Duitku: V2 untuk custom payment page dan POP untuk hosted payment selection; create invoice memakai HMAC-SHA256 header signature.
- DOKU: DOKU Checkout untuk hosted payment page dan Direct API/SNAP untuk direct payment; notification harus diverifikasi dengan signature resmi.
