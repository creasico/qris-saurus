# Gateway Payments

[English](../en/sdk/payments.md) | Bahasa Indonesia

Dokumen ini menjelaskan arah multi-method gateway di `qris-saurus`: **direct payments** untuk UI milik merchant dan **hosted checkout** untuk UI milik provider.

## Prinsip production

- Webhook provider adalah source of truth untuk status `paid`, bukan redirect browser atau polling frontend.
- Semua webhook harus diverifikasi dengan signature/token provider sebelum order di-update.
- SDK tidak menyediakan UI bawaan; SDK hanya menormalisasi request/response provider.
- Gunakan `createPayment()` untuk pembayaran direct API/custom UI.
- Gunakan `createCheckout()` untuk payment page/hosted UI provider.
- Simpan `gatewayOrderId`/reference provider untuk status check dan reconciliation.

## Direct payment vs hosted checkout

| Flow | Siapa yang menyediakan UI | Method | Return utama | Kapan dipakai |
| --- | --- | --- | --- | --- |
| Direct payment | Merchant/app kamu | `gateway.createPayment()` | `qrisString`, `vaNumber`, `deeplinkUrl`, `paymentUrl` | Checkout custom, POS, app mobile |
| Hosted checkout | Provider | `gateway.createCheckout()` | `checkoutUrl` | Integrasi cepat, provider menampilkan pilihan metode |

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

## Dukungan saat ini

| Provider | QRIS direct | VA direct | E-wallet direct | Hosted checkout | Webhook verification |
| --- | --- | --- | --- | --- | --- |
| Midtrans | Ya | BCA, BNI, BRI, Permata, CIMB | GoPay, ShopeePay | Snap redirect | SHA512 notification signature |
| Xendit | Ya | Belum di adapter ini | Belum di adapter ini | Belum di adapter ini | Callback token |
| Duitku | Ya | Belum di adapter ini | Belum di adapter ini | Belum di adapter ini | HMAC-SHA256 callback signature |
| DOKU | Ya | Belum di adapter ini | Belum di adapter ini | Belum di adapter ini | SNAP signature + timestamp window |

Catatan: Xendit, Duitku, dan DOKU menyediakan metode VA/e-wallet/hosted UI di dokumentasi resmi, tetapi adapter `qris-saurus` baru mengaktifkan direct QRIS untuk provider tersebut sampai request/response dan webhook per method diimplementasikan dengan test terpisah.

## Referensi dokumentasi provider

- Midtrans Core API: `POST /v2/charge` untuk direct payment, termasuk QRIS, VA, GoPay, dan ShopeePay.
- Midtrans Snap: `POST /snap/v1/transactions` untuk hosted checkout (`redirect_url`).
- Xendit: Payment Request API `POST /v3/payment_requests`, Payment Links, dan callback token.
- Duitku: V2 untuk custom payment page dan POP untuk hosted payment selection; create invoice memakai HMAC-SHA256 header signature.
- DOKU: DOKU Checkout untuk hosted payment page dan Direct API/SNAP untuk direct payment; notification harus diverifikasi dengan signature resmi.
