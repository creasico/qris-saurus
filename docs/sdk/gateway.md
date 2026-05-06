# Gateway Integration

Dokumen ini menjelaskan perbedaan antara **local transform** dan **gateway API**, kapan memakai masing-masing, dan cara menggunakan adapter gateway yang sudah tersedia.

---

## Perbedaan mendasar

| Aspek                | Local transform                  | Gateway API                      |
| -------------------- | -------------------------------- | -------------------------------- |
| Koneksi internet     | Tidak butuh                      | Wajib                            |
| Expiry time          | Tidak ada (QR berlaku selamanya) | Ada (dikontrol gateway)          |
| Payment notification | Tidak ada                        | Webhook dari gateway             |
| Reconciliation       | Manual                           | Via dashboard gateway            |
| Refund               | Tidak tersedia                   | Tersedia di beberapa gateway     |
| Kecepatan generate   | Langsung (sync)                  | Tergantung latency API           |
| Cocok untuk          | Merchant sudah punya QRIS statis | Sistem checkout baru via gateway |

---

## Local transform — cara kerja

Library membaca QRIS statis yang sudah ada, memodifikasi payload-nya secara lokal, dan menghasilkan string baru yang valid. Semua terjadi di memory, tanpa I/O ke server.

```
QRIS statis (dari acquirer/gateway)
          │
          ▼
   staticToDynamic()
          │
          ▼
QRIS dinamis (CRC valid, nominal embedded)
```

Semua provider saat ini menggunakan mode ini.

---

## Gateway API — cara kerja

Gateway seperti Midtrans, Xendit, dan Duitku menyediakan endpoint untuk membuat QR baru dari sisi server mereka. QR yang dihasilkan sudah punya expiry, terikat ke order ID gateway, dan bisa dipantau statusnya.

`qris-saurus` sudah menyediakan adapter siap pakai untuk ketiga gateway ini.

```
Request { amount, orderId, ... }
          │
          ▼
   POST /v2/charge  (Midtrans)
   POST /qr_codes   (Xendit)
   POST /...        (Duitku)
          │
          ▼
Response { qr_string, expiry_time, ... }
          │
          ▼
   render ke image → tampilkan ke user
```

---

## Provider API overview

### Midtrans

Midtrans sudah punya endpoint resmi untuk QRIS dinamis via Core API.

```
POST https://api.midtrans.com/v2/charge
Authorization: Basic base64(serverKey + ":")
Content-Type: application/json

{
  "payment_type": "qris",
  "transaction_details": {
    "order_id": "INV-2026-001",
    "gross_amount": 75000
  },
  "qris": {
    "acquirer": "gopay"
  }
}
```

Response berisi `actions[].url` dengan URL ke QR image, atau `qr_string` tergantung tipe response.

- Membutuhkan: Server Key, dikodekan Base64
- Expiry: dikontrol oleh Midtrans (biasanya 15–30 menit)
- Webhook: `X-Override-Notification` header untuk notifikasi

### Xendit

Xendit mendukung QRIS via QR Codes API. Satu integrasi membuka banyak channel pembayaran (e-wallet + mobile banking).

```
POST https://api.xendit.co/qr_codes
Authorization: Basic base64(secretKey + ":")
Content-Type: application/json

{
  "reference_id": "INV-2026-001",
  "type": "DYNAMIC",
  "currency": "IDR",
  "amount": 75000,
  "channel_code": "QRIS"
}
```

Response berisi `qr_string` yang langsung bisa dirender, ditambah `expires_at` dan `id` untuk cek status.

- Membutuhkan: Secret Key
- Expiry: 48 jam secara default
- Refund: tersedia via API

### Duitku

Duitku menggunakan sistem transaksi umum yang menghasilkan payment URL atau QR untuk berbagai metode pembayaran termasuk QRIS.

```
POST https://api-prod.duitku.com/api/merchant/createInvoice
Content-Type: application/json

{
  "merchantCode": "...",
  "paymentAmount": 75000,
  "merchantOrderId": "INV-2026-001",
  "productDetails": "Pembayaran Order",
  "email": "customer@example.com",
  "paymentMethod": "QRIS",
  "signature": "...",  // MD5(merchantCode + amount + orderId + merchantKey)
  "returnUrl": "https://...",
  "callbackUrl": "https://...",
  "expiryPeriod": 1440  // menit
}
```

Response berisi `paymentUrl` dan `qrString` untuk metode QR.

- Membutuhkan: Merchant Code + Merchant Key (untuk signature)
- Expiry: dikontrol via `expiryPeriod`
- Callback: via `callbackUrl`

### ShopeePay & GoPay

ShopeePay dan GoPay tidak memiliki **public standalone API** untuk QRIS dinamis yang tersedia secara umum bagi merchant biasa. Keduanya biasanya diakses via:

- **Midtrans** (GoPay acquirer, QRIS multi-channel)
- **Aggregator lain** yang menjadi acquirer ShopeePay/GoPay
- **Merchant dashboard** khusus (bukan open API)

Untuk saat ini, ShopeePay dan GoPay diperlakukan sebagai local transform. Jika butuh notifikasi dan expiry, gunakan Midtrans sebagai aggregator.

---

## Adapter yang tersedia

Setiap gateway punya class adapter yang diekspor dari `qris-saurus`:

```
src/
└── providers/
    ├── base.ts              ← ProviderAdapter (local transform)
    ├── registry.ts          ← detectProvider, makeDynamic
    ├── shopeepay.ts
    ├── gopay.ts
    ├── midtrans.ts
    ├── xendit.ts
    ├── duitku.ts
    └── adapters/
        ├── types.ts         ← MidtransConfig, XenditConfig, DuitkuConfig,
        │                       ApiQrCreateOptions, ApiQrResult
        ├── midtrans.ts      ← MidtransAdapter, midtransAdapter
        ├── xendit.ts        ← XenditAdapter, xenditAdapter
        └── duitku.ts        ← DuitkuAdapter, duitkuAdapter
```

### Types

```ts
// Config per gateway
interface MidtransConfig { serverKey: string; sandbox?: boolean; }
interface XenditConfig   { secretKey: string; }
interface DuitkuConfig   { merchantCode: string; merchantKey: string; sandbox?: boolean; }

// Opsi saat buat QR
interface ApiQrCreateOptions {
  orderId: string;          // unik per transaksi, wajib
  amount: number;
  description?: string;
  customerEmail?: string;
}

// Hasil dari createDynamicQr
interface ApiQrResult {
  qrisString: string;       // langsung bisa dirender
  gatewayOrderId: string;   // simpan ini untuk checkPaymentStatus
  expiresAt?: Date;
  raw: unknown;
}

// Hasil dari checkPaymentStatus
type PaymentStatusCode = "pending" | "paid" | "expired" | "failed" | "cancelled";

interface PaymentStatusResult {
  orderId: string;
  status: PaymentStatusCode;
  amount?: number;
  paidAt?: Date;
  raw: unknown;
}
```

### Penggunaan

```ts
import {
  midtransAdapter,
  xenditAdapter,
  duitkuAdapter,
  renderQrToDataUrl,
} from "qris-saurus";

// --- Midtrans ---
const midtransQr = await midtransAdapter.createDynamicQr(
  { orderId: "INV-2026-001", amount: 75_000 },
  { serverKey: process.env.MIDTRANS_SERVER_KEY!, sandbox: true },
);
const status = await midtransAdapter.checkPaymentStatus(
  "INV-2026-001",
  { serverKey: process.env.MIDTRANS_SERVER_KEY!, sandbox: true },
);
// status.status → "pending" | "paid" | "expired" | "failed" | "cancelled"

// --- Xendit ---
const xenditQr = await xenditAdapter.createDynamicQr(
  { orderId: "INV-2026-001", amount: 75_000 },
  { secretKey: process.env.XENDIT_SECRET_KEY! },
);
const xenditStatus = await xenditAdapter.checkPaymentStatus(
  xenditQr.gatewayOrderId,   // gunakan id dari response, bukan orderId
  { secretKey: process.env.XENDIT_SECRET_KEY! },
);

// --- Duitku ---
const duitkuQr = await duitkuAdapter.createDynamicQr(
  { orderId: "INV-2026-001", amount: 75_000, customerEmail: "u@example.com" },
  { merchantCode: process.env.DUITKU_CODE!, merchantKey: process.env.DUITKU_KEY! },
);
const duitkuStatus = await duitkuAdapter.checkPaymentStatus(
  "INV-2026-001",
  { merchantCode: process.env.DUITKU_CODE!, merchantKey: process.env.DUITKU_KEY! },
);

// --- Render hasil ke image ---
const image = await renderQrToDataUrl(midtransQr.qrisString);
```

---

## Kapan pakai apa?

```
Apakah kamu sudah punya QRIS statis dari acquirer/bank?
    │
    ├── Ya → apakah butuh expiry, webhook, atau reconciliation via gateway?
    │           │
    │           ├── Tidak → gunakan local transform (tersedia sekarang)
    │           │
    │           └── Ya → gunakan gateway API adapter (Midtrans/Xendit/Duitku)
    │
    └── Tidak → gunakan gateway API untuk generate QR baru dari sistem gateway
```

### Decision matrix

| Kebutuhan                                   | Rekomendasi                     |
| ------------------------------------------- | ------------------------------- |
| Kasir offline / tanpa internet              | Local transform                 |
| POS internal, nominal saja                  | Local transform                 |
| Invoice digital, nominal saja               | Local transform                 |
| Checkout online + expiry QR                 | Gateway API (Midtrans / Xendit) |
| Notifikasi pembayaran otomatis              | Gateway API + webhook           |
| Refund via API                              | Xendit atau Midtrans            |
| Multi-merchant / aggregator                 | Midtrans atau Xendit            |
| Bayar via GoPay/ShopeePay dengan notifikasi | Midtrans (sebagai acquirer)     |

---

## Keamanan credential gateway

Credential gateway (server key, secret key, merchant key) **tidak boleh ada di frontend atau di-bundle ke library**. Selalu simpan di:

- environment variable di server (`process.env.MIDTRANS_SERVER_KEY`)
- secret manager (Vault, AWS SSM, dll)
- backend service yang menjadi perantara

```ts
// BENAR — hanya di backend
await midtransAdapter.createDynamicQr(options, {
  serverKey: process.env.MIDTRANS_SERVER_KEY!,
});

// SALAH — jangan expose di client / frontend
const serverKey = "SB-Mid-server-xxxxx"; // JANGAN ini di frontend
```

---

## Referensi API resmi

| Gateway  | Dokumen API                                          |
| -------- | ---------------------------------------------------- |
| Midtrans | https://docs.midtrans.com/reference/qris             |
| Xendit   | https://developers.xendit.co/api-reference/#qr-codes |
| Duitku   | https://docs.duitku.com                              |
