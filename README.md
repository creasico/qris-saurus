<div align="center">

# qris-saurus

![qris-saurus hero](./qris-saurus-hero.png)

Bun/TypeScript SDK untuk parse, validasi, deteksi provider, dan transformasi QRIS statis menjadi QRIS dinamis.

[![npm version](https://img.shields.io/npm/v/qris-saurus?style=flat-square&color=blue)](https://npmjs.com/package/qris-saurus)
[![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![ci status](https://img.shields.io/github/actions/workflow/status/creasico/qris-saurus/ci.yml?branch=main&style=flat-square)](https://github.com/creasico/qris-saurus/actions)
[![bun](https://img.shields.io/badge/bun-1.3.13+-512e15?style=flat-square&logo=bun)](https://bun.sh)

</div>

[English](./README.en.md) | Bahasa Indonesia

## Daftar isi

- [Apa itu QRIS?](#apa-itu-qris)
- [Bagaimana QRIS bekerja?](#bagaimana-qris-bekerja)
- [QRIS statis vs dinamis](#qris-statis-vs-dinamis)
- [Bagaimana qris-saurus bekerja?](#bagaimana-qris-saurus-bekerja)
- [Tujuan](#tujuan)
- [Cara kerja](#cara-kerja)
- [Instalasi](#instalasi)
- [Konfigurasi environment](#konfigurasi-environment)
- [Mulai cepat](#mulai-cepat)
- [Implementasi sederhana](#implementasi-sederhana)
- [Contoh lengkap](#contoh-lengkap)
- [Penanganan error](#penanganan-error)
- [Gateway & custom provider](#gateway--custom-provider)
- [Gateway payments multi-method](#gateway-payments-multi-method)
- [CLI](#cli)
- [Rendering dari library](#rendering-dari-library)
- [API tersedia](#api-tersedia)
- [Prioritas input CLI](#prioritas-input-cli)
- [Pengembangan](#pengembangan)
- [Dokumentasi](#dokumentasi)

## Apa itu QRIS?

QRIS adalah standar QR payment di Indonesia yang menyatukan banyak metode pembayaran di bawah satu format QR. Secara teknis, payload QRIS adalah string **TLV** (`Tag-Length-Value`) berbasis spesifikasi EMVCo. Setiap segmen punya:

- `Tag`: identitas field, misalnya `54` untuk amount
- `Length`: panjang isi field
- `Value`: isi field itu sendiri

Contoh sederhananya:

```text
540812500.00
```

Artinya:
- `54` = transaction amount
- `08` = panjang value
- `12500.00` = nilai amount

## Bagaimana QRIS bekerja?

Secara umum, alurnya seperti ini:

1. **Merchant memiliki QRIS payload**
   - bisa QRIS statis dari acquirer/gateway
   - bisa QRIS dinamis yang sudah digenerate gateway
2. **Customer scan QR** dengan app seperti ShopeePay, GoPay, mobile banking, atau aplikasi lain yang mendukung QRIS
3. **App membaca payload TLV** dan menampilkan informasi merchant/transaksi
4. **Switching dan routing** dilakukan oleh ekosistem pembayaran sesuai identifier merchant dan acquirer
5. **Issuer memproses pembayaran**
6. **Merchant menerima notifikasi/settlement** dari gateway atau acquirer

Library ini bekerja di lapisan **payload construction/manipulation**, bukan di lapisan settlement atau switching network.

```mermaid
sequenceDiagram
    participant M as Merchant
    participant C as Customer
    participant A as Payment App
    participant N as Payment Network
    participant I as Issuer

    M->>C: 1. Tampilkan QR Code
    C->>A: 2. Scan QR
    A->>A: 3. Baca payload TLV
    A->>N: 4. Routing & switching
    N->>I: 5. Proses pembayaran
    I-->>N: 6. Hasil
    N-->>A: 7. Settlement
    A-->>M: 8. Notifikasi
```

## QRIS statis vs dinamis

### QRIS statis
Biasanya dipakai untuk merchant display tetap. Nominal tidak tertanam di payload, sehingga customer mengisi nominal sendiri atau nominal ditentukan dari flow di sisi aplikasi pembayaran.

Ciri umumnya:
- point of initiation method `11`
- bisa dipakai berkali-kali
- tidak spesifik ke satu transaksi

### QRIS dinamis
Dibuat untuk transaksi tertentu. Nominal dan data tambahan bisa disematkan ke payload.

Ciri umumnya:
- point of initiation method `12`
- nominal transaksi ada di tag `54`
- dapat membawa reference tambahan di tag `62`
- lebih cocok untuk checkout, invoice, POS, dan order-based payments

## Bagaimana qris-saurus bekerja?

`qris-saurus` mengikuti alur berikut:

1. **parse** payload QRIS ke struktur TLV
2. **validate** struktur dasar dan CRC
3. **detectProvider** bila identifier provider dikenali
4. **transform** QRIS statis menjadi dinamis
5. **serialize** payload baru dan hitung ulang CRC

```mermaid
flowchart TD
    A[String QRIS Statis] --> B["parse() → TLV Nodes"]
    B --> C{"validate()\nCRC & tag valid?"}
    C -- Invalid --> X[Throw Error]
    C -- Valid --> D["Tag 01: 11 → 12\n(static → dynamic)"]
    D --> E["Sisipkan Tag 54 (amount)"]
    E --> F["Sisipkan Tag 62\n(merchant ref, terminal)"]
    F --> G["Recalculate CRC\n(Tag 63)"]
    G --> H["serialize()\n→ String QRIS Dinamis"]
```

Library ini mendukung dua mode: **transformasi lokal** dari QRIS statis menjadi QRIS dinamis, dan **pembayaran gateway** untuk membuat QRIS dinamis langsung lewat API provider seperti Midtrans, Xendit, Duitku, dan DOKU.

## Tujuan

- Mengubah QRIS statis menjadi QRIS dinamis secara lokal
- Memastikan payload tetap valid dengan CRC yang benar
- Menyediakan fondasi provider-aware untuk ShopeePay, GoPay, Midtrans, Xendit, Duitku, dan DOKU
- Mudah di-import dari project Bun/TypeScript lain

## Cara kerja

QRIS mengikuti **EMVCo QR Code Specification** menggunakan encoding **TLV (Tag-Length-Value)**:

```
[Tag: 2 digit][Length: 2 digit][Value: variable]
```

Contoh annotasi payload nyata:

```
00020101021126360014ID.CO.QRIS.WWW0114GENERICSTORE01520458125303360
│    │    │    │
│    │    │    └─ 26: merchant account info (length 36)
│    │    └─────── 01: initiation method (length 2, value "11" = static)
│    └──────────── 00: format indicator  (length 2, value "01")
│
5802ID5911QRIS SAURUS6007JAKARTA63041669
│         │           │         │
│         │           │         └─ 63: CRC (length 4)
│         │           └──────────── 60: city (length 7)
│         └────────────────────────── 59: merchant name (length 11)
└──────────────────────────────────────── 58: country code (length 2)
```

### Proses konversi statis → dinamis

Saat `staticToDynamic()` dipanggil, library melakukan:

1. **Parse** — payload dipecah menjadi array TLV nodes
2. **Validasi** — cek kehadiran dan validitas CRC (tag `63`)
3. **Ubah initiation method** — tag `01` dari `11` → `12`
4. **Sisipkan amount** — tambahkan tag `54` dengan nilai amount
5. **Sisipkan additional data** — tag `62` berisi sub-tag:
   - `05` = merchant reference (bila ada)
   - `07` = terminal label (bila ada)
6. **Sisipkan tip** — bila `tipType` diberikan, sisipkan tag root:
   - `55` = tip indicator (`02` = fixed, `03` = percent)
   - `56` = nominal tip fixed
   - `57` = persentase tip
7. **Hitung ulang CRC** — CRC16/CCITT atas seluruh payload kecuali 4 char terakhir
8. **Serialize** — nodes dikembalikan ke string payload

### Tag penting QRIS

| Tag       | Nama                         | Contoh nilai              |
| --------- | ---------------------------- | ------------------------- |
| `00`      | Format indicator             | `01`                      |
| `01`      | Initiation method            | `11` statis, `12` dinamis |
| `26`–`51` | Merchant account info        | per provider              |
| `52`      | Merchant category code (MCC) | `5812`                    |
| `53`      | Currency code                | `360` (IDR)               |
| `54`      | Transaction amount           | `25000.00`                |
| `55`      | Tip or convenience indicator | `02` fixed, `03` percent  |
| `56`      | Fixed convenience fee        | `1000.00`                 |
| `57`      | Percentage convenience fee   | `2.00`                    |
| `58`      | Country code                 | `ID`                      |
| `59`      | Merchant name                | `QRIS SAURUS`             |
| `60`      | Merchant city                | `JAKARTA`                 |
| `62`      | Additional data field        | sub-tag `05`, `07`, `08`  |
| `63`      | CRC                          | 4 char hex                |

## Instalasi

Instal dari package manager yang kamu pakai:

```bash
npm install qris-saurus
```

```bash
pnpm add qris-saurus
```

```bash
bun add qris-saurus
```

Kalau kamu bekerja langsung di repository ini:

```bash
bun install
```

## Konfigurasi environment

Buat file `.env` dari template:

```bash
cp .env.example .env
```

`.env.example`:

```env
# Midtrans
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxxxxxxxxxxxx
MIDTRANS_SANDBOX=true

# Xendit
XENDIT_SECRET_KEY=xnd_development_xxxxxxxxxxxxxxxxxxxxxxxx

# Duitku
DUITKU_MERCHANT_CODE=Dxxxxx
DUITKU_MERCHANT_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DUITKU_SANDBOX=true

# DOKU SNAP QRIS
DOKU_CLIENT_ID=BRN-xxxxxxxx
DOKU_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DOKU_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----"
DOKU_MERCHANT_ID=xxxxxxxx
DOKU_TERMINAL_ID=A01
# Required only for direct Virtual Account payments.
DOKU_VA_PARTNER_SERVICE_ID=19008
DOKU_SANDBOX=true
```

Gunakan dalam kode:

```ts
import { dokuAdapter, duitkuAdapter, midtransAdapter, xenditAdapter } from "qris-saurus";

const midtransConfig = {
  serverKey: process.env.MIDTRANS_SERVER_KEY!,
  sandbox: process.env.MIDTRANS_SANDBOX === "true",
};

const xenditConfig = {
  secretKey: process.env.XENDIT_SECRET_KEY!,
};

const duitkuConfig = {
  merchantCode: process.env.DUITKU_MERCHANT_CODE!,
  merchantKey: process.env.DUITKU_MERCHANT_KEY!,
  sandbox: process.env.DUITKU_SANDBOX === "true",
  returnUrl: "https://merchant.example/return",
  callbackUrl: "https://merchant.example/webhooks/duitku",
};

const dokuConfig = {
  clientId: process.env.DOKU_CLIENT_ID!,
  clientSecret: process.env.DOKU_CLIENT_SECRET!,
  privateKey: process.env.DOKU_PRIVATE_KEY!,
  merchantId: process.env.DOKU_MERCHANT_ID!,
  terminalId: process.env.DOKU_TERMINAL_ID!,
  sandbox: process.env.DOKU_SANDBOX === "true",
  webhookPath: "/webhooks/doku",
};
```

## Mulai cepat

```ts
import { makeDynamic, staticToDynamic, validate } from "qris-saurus";

const dynamicQris = staticToDynamic(staticQrisString, {
  amount: 12500,
  merchantRef: "INV-001",
  terminalLabel: "POS-A",
});

const result = makeDynamic(staticQrisString, {
  amount: 12500,
});

console.log(dynamicQris);
console.log(result.provider);
console.log(validate(dynamicQris));
```

## Implementasi sederhana

Ada dua cara menggunakan qris-saurus: sebagai **package** (SDK) di project TypeScript/Bun kamu, atau langsung via **CLI** di terminal.

```mermaid
flowchart LR
    subgraph SDK["Paket SDK"]
        direction TB
        S1["bun add qris-saurus"] --> S2["import & transform"]
        S2 --> S3["render / gateway"]
    end
    subgraph Terminal["CLI Terminal"]
        direction TB
        C1["bun run build"] --> C2["validate → dynamic"]
        C2 --> C3["render → PNG"]
    end
```

### Package (SDK)

```bash
bun add qris-saurus
```

```ts
import { makeDynamic, renderQrToDataUrl, validate } from "qris-saurus";

const STATIC_QRIS = "00020101021126610016ID.CO.SHOPEE.WWW...";

// 1. Transformasi statis → dinamis
const { qrisString, provider } = makeDynamic(STATIC_QRIS, {
  amount: 25000,
  merchantRef: "INV-001",
});

// 2. Validasi hasil
validate(qrisString); // { valid: true, errors: [] }

// 3. Render ke gambar
const qrImage = await renderQrToDataUrl(qrisString, { width: 320 });
// <img src={qrImage} />
```

### CLI

```bash
# Build CLI
bun run build

# Validasi payload
bun run dist/cli.js validate "000201010211..."

# Transformasi statis → dinamis
bun run dist/cli.js dynamic "000201010211..." --amount 25000 --merchant-ref INV-001

# Render ke file PNG
bun run dist/cli.js render "000201010211..." --output ./qris.png
```

## Contoh lengkap

Contoh standalone tersedia di folder [`examples`](./examples):

```bash
bun run examples/basic.ts    # Core API: parse, validate, detect, transform
bun run examples/render.ts   # Render QR ke file dan data URL
bun run examples/gateway.ts  # Integrasi gateway (Midtrans, Xendit, Duitku, DOKU)
```

### Parse payload QRIS

```ts
import { parse } from "qris-saurus";

const qris =
  "00020101021126610016ID.CO.SHOPEE.WWW01189360091800230223530208230223530303UMI51440014ID.CO.QRIS.WWW0215ID10265163524850303UMI5204581753033605802ID5913Chick n booth6010PEKALONGAN61055118262070703A016304B9ED";

const parsed = parse(qris);

parsed.nodes.find((n) => n.id === "59")?.value; // "Chick n booth"
parsed.nodes.find((n) => n.id === "60")?.value; // "PEKALONGAN"
parsed.nodes.find((n) => n.id === "53")?.value; // "360" (IDR)
parsed.crc; // "B9ED"
```

### Validasi payload

```ts
import { validate } from "qris-saurus";

const result = validate(qris);
// { valid: true, errors: [] }

const tampered = qris.slice(0, -4) + "0000";
const invalid = validate(tampered);
// { valid: false, errors: ["Invalid CRC value"] }
```

### Deteksi provider

```ts
import { detectProvider, listProviders } from "qris-saurus";

const provider = detectProvider(qris);
console.log(provider?.info.code);    // "shopeepay"
console.log(provider?.info.name);    // "ShopeePay"
console.log(provider?.info.supportsApiDynamic); // false

const all = listProviders();
for (const p of all) {
  console.log(`${p.info.code}: ${p.info.name}`);
}
```

### Transformasi statis ke dinamis

```ts
import { staticToDynamic } from "qris-saurus";

const dynamic = staticToDynamic(qris, {
  amount: 75000,
  merchantRef: "ORD-2024-001",
  terminalLabel: "POS-01",
});
```

### Transformasi dengan tip

```ts
import { staticToDynamic } from "qris-saurus";

// Tip tetap (Rp 2.000)
const withFixedTip = staticToDynamic(qris, {
  amount: 50000,
  tipType: "fixed",
  tipValue: 2000,
});

// Tip persen (5%)
const withPercentTip = staticToDynamic(qris, {
  amount: 50000,
  tipType: "percent",
  tipValue: 5,
});
```

### makeDynamic dengan deteksi provider

```ts
import { makeDynamic } from "qris-saurus";

const result = makeDynamic(qris, {
  amount: 25000,
  merchantRef: "INV-001",
});

console.log(result.source);   // "local" (transformasi lokal)
console.log(result.provider); // "shopeepay"
console.log(result.amount);   // 25000
console.log(result.qrisString); // payload dinamis baru
```

### CRC dan serialisasi

```ts
import { computeCrc, verifyCrc, parse, serialize } from "qris-saurus";

// Hitung CRC dari payload (termasuk "6304" di akhir)
const payload = qris.slice(0, -4); // buang 4 char CRC, simpan "6304"
const crc = computeCrc(payload);
console.log(crc); // "1669"

// Verifikasi CRC pada string QRIS
const isValid = verifyCrc(qris);
console.log(isValid); // true

// Parse lalu serialize — payload harus sama
const parsed = parse(qris);
const reserialized = serialize(parsed);
console.log(qris === reserialized); // true
```

### Render QR ke gambar

```ts
import { renderQrToDataUrl, renderQrToFile, makeDynamic } from "qris-saurus";

const { qrisString } = makeDynamic(qris, { amount: 50000 });

// Base64 data URL — langsung bisa dipakai di HTML
const dataUrl = await renderQrToDataUrl(qrisString, { width: 320 });
// data:image/png;base64,...

// Simpan ke file
await renderQrToFile(qrisString, "./qris.png", { width: 400, margin: 3 });
```

### Contoh penanganan error

```ts
import { validate, parse, makeDynamic, staticToDynamic } from "qris-saurus";

// validate() tidak pernah throw — kembalikan { valid, errors }
const check = validate("bukan-qris");
// { valid: false, errors: ["QRIS payload too short"] }

// parse() throw bila CRC hilang/salah
try {
  parse("invalid");
} catch (err) {
  console.error(err.message); // "QRIS payload is missing CRC tag"
}

// staticToDynamic() throw bila sudah dinamis
const dynamic = staticToDynamic(qris, { amount: 10000 });
try {
  staticToDynamic(dynamic, { amount: 10000 });
} catch (err) {
  console.error(err.message); // "QRIS payload is already dynamic"
}

// staticToDynamic() throw bila amount negatif
try {
  staticToDynamic(qris, { amount: -500 });
} catch (err) {
  console.error(err.message); // "Amount must be a positive number"
}
```

## Penanganan error

`validate()` bersifat sinkron dan tidak pernah throw — hasil dikembalikan via `ValidationResult`. Namun `parse()`, `staticToDynamic()`, dan `makeDynamic()` dapat throw bila input tidak valid (CRC hilang/salah, amount tidak valid, dsb). Gateway adapters menggunakan `async/await` dan dapat throw bila request gagal.

```ts
import { validate, makeDynamic, parse, midtransAdapter } from "qris-saurus";

// validate() — tidak throw, cek .valid
const check = validate(qrisString);
if (!check.valid) {
  console.error("Invalid QRIS:", check.errors);
  // errors: ["Invalid CRC value", "Missing required tag 00", ...]
}

// parse() / makeDynamic() / staticToDynamic() — dapat throw, gunakan try/catch
try {
  const dynamic = makeDynamic(qrisString, { amount: 25000 });
  console.log(dynamic.source); // "local"
} catch (err) {
  // Input tidak valid, CRC salah, atau amount tidak valid
  console.error("Transform error:", err);
}

// Gateway adapter — dapat throw, tangkap dengan try/catch
try {
  const result = await midtransAdapter.createDynamicQr(
    { orderId: "INV-001", amount: 25000 },
    midtransConfig,
    { overrideNotificationUrl: "https://merchant.example/webhooks/midtrans" },
  );
  console.log(result.qrisString);   // payload QRIS mentah
  console.log(result.qrImageUrl);   // URL PNG QR bila Midtrans mengembalikannya
} catch (err) {
  // Network error, auth error, atau response tidak valid
  console.error("Gateway error:", err);
}

// Cek status pembayaran
try {
  const status = await midtransAdapter.checkPaymentStatus("INV-001", midtransConfig);
  // status.status: "pending" | "paid" | "expired" | "failed" | "cancelled"
  if (status.status === "paid") {
    console.log("Lunas pada:", status.paidAt);
  }
} catch (err) {
  console.error("Status check error:", err);
}
```

## Gateway & custom provider

SDK ini menyediakan `gateway` singleton untuk mempermudah integrasi berbagai provider (Midtrans, Xendit, Duitku, DOKU) melalui satu _interface_ yang terpusat. Gateway mendelegasikan panggilan ke adapter tanpa perlu pengecekan provider secara manual di kodemu.

### Pembayaran gateway

| Provider | `provider` | Dynamic QRIS | Status polling | Webhook verify | Config wajib | Catatan |
| -------- | ---------- | ------------ | -------------- | -------------- | ------------ | ------- |
| Midtrans | `midtrans` | Ya, via `/v2/charge` QRIS | Ya | Signature SHA512 dari payload + `serverKey` | `serverKey`, `sandbox?` | Mendukung `cancel()`, `expire()`, dan `refund()` lewat gateway helper. |
| Xendit | `xendit` | Ya, QR Code API + VA direct + e-wallet direct + hosted invoice | Ya, QRIS polling + webhook callback token | `x-callback-token` bila `callbackToken` diset | `secretKey`, `callbackToken?` | VA direct memakai BCA/BNI/BRI/Mandiri/Permata; e-wallet direct memakai `ID_OVO`, `ID_DANA`, `ID_LINKAJA`, `ID_SHOPEEPAY`. CIMB VA tetap guarded. |
| Duitku | `duitku` | Ya, Direct API `/v2/inquiry` QRIS + VA + e-wallet | Ya, `/transactionStatus` | HMAC-SHA256 dari `merchantCode + amount + merchantOrderId` | `merchantCode`, `merchantKey`, `returnUrl`, `callbackUrl`, `sandbox?` | QRIS default `SP`; VA memakai `BC`, `I1`, `BR`, `M2`, `BT`, `B1`; e-wallet memakai `OV`, `SA`, `DA`, `LF`. |
| DOKU | `doku` | Ya, SNAP QRIS MPM Generate + VA direct + e-wallet DANA/ShopeePay | Ya, QRIS MPM Query + helper VA/e-wallet status | HMAC-SHA512 SNAP dari method, path, token, body hash, timestamp | `clientId`, `clientSecret`, `privateKey`, `merchantId`, `terminalId`, `virtualAccountPartnerServiceId?`, `webhookPath?`, `sandbox?` | Access token B2B ditandatangani RSA-SHA256 dan dicache otomatis; VA direct butuh BIN merchant; OVO tetap guarded karena perlu binding/tokenization. |

Semua provider memakai method gateway yang sama:

```ts
import { gateway } from "qris-saurus";

// 1. Configure provider aktif sekali saat boot aplikasi
gateway.configure({
  provider: "doku",
  clientId: process.env.DOKU_CLIENT_ID!,
  clientSecret: process.env.DOKU_CLIENT_SECRET!,
  privateKey: process.env.DOKU_PRIVATE_KEY!,
  merchantId: process.env.DOKU_MERCHANT_ID!,
  terminalId: process.env.DOKU_TERMINAL_ID!,
  sandbox: true,
  webhookPath: "/webhooks/doku",
});

// 2. Buat QRIS dinamis untuk satu order
const chargeResult = await gateway.charge("INV-001", 50000, {
  description: "Pembayaran INV-001",
  customerEmail: "customer@example.com",
});

// 3. Cek status atau polling sampai terminal state
const statusResult = await gateway.status(chargeResult.gatewayOrderId);
const finalStatus = await gateway.pollPaymentStatus(chargeResult.gatewayOrderId, {
  intervalMs: 2000,
  timeoutMs: 60000,
});

// 4. Verify webhook/callback provider
const verifyResult = gateway.verify(webhookPayload, headers); // sync
// DOKU: pass rawBody when your framework exposes it.
const dokuVerifyResult = gateway.verify(webhookPayload, headers, { rawBody });
```

Status hasil normalisasi selalu memakai union berikut: `pending`, `paid`, `refunded`, `expired`, `failed`, atau `cancelled`. Simpan `gatewayOrderId` dari hasil `charge()` karena beberapa provider mengembalikan ID transaksi gateway yang berbeda dari order ID merchant. Adapter gateway hanya untuk server-side; jangan kirim secret/private key ke browser dan jangan log config, access token, atau raw error provider.

#### Contoh konfigurasi Duitku

```ts
gateway.configure({
  provider: "duitku",
  merchantCode: process.env.DUITKU_MERCHANT_CODE!,
  merchantKey: process.env.DUITKU_MERCHANT_KEY!, // API key Duitku
  sandbox: true,
  returnUrl: "https://merchant.example/payment/return",
  callbackUrl: "https://merchant.example/webhooks/duitku",
  paymentMethod: "SP", // default QRIS, bisa disesuaikan dengan channel Duitku yang aktif
});
```

Duitku adapter mengirim `paymentAmount`, `paymentMethod`, `merchantOrderId`, `productDetails`, `callbackUrl`, `returnUrl`, dan signature HMAC-SHA256 ke endpoint inquiry. `createPayment()` mendukung QRIS, VA BCA/BNI/BRI/Mandiri/Permata/CIMB, serta e-wallet OVO/ShopeePay/DANA/LinkAja dari kode metode resmi Duitku. Callback diparse dari `merchantOrderId`, `amount`, `resultCode`, `paymentCode`, `reference`, `vaNumber`, dan `signature`. Secara default, `parseWebhook()` melempar error bila signature tidak valid; gunakan `{ throwOnInvalid: false }` hanya jika ingin menerima hasil aman `valid: false` tanpa field pembayaran ternormalisasi.

#### Contoh konfigurasi DOKU

```ts
gateway.configure({
  provider: "doku",
  clientId: process.env.DOKU_CLIENT_ID!,
  clientSecret: process.env.DOKU_CLIENT_SECRET!,
  privateKey: process.env.DOKU_PRIVATE_KEY!,
  merchantId: process.env.DOKU_MERCHANT_ID!,
  terminalId: process.env.DOKU_TERMINAL_ID!,
  // Wajib hanya saat memakai direct Virtual Account.
  virtualAccountPartnerServiceId: process.env.DOKU_VA_PARTNER_SERVICE_ID,
  sandbox: true,
  channelId: "H2H",
  serviceCode: "47",
  webhookPath: "/webhooks/doku",
  additionalInfo: {
    postalCode: "12190",
    feeType: "1",
  },
});
```

DOKU adapter menjalankan flow SNAP: ambil access token B2B dengan RSA-SHA256, generate QRIS MPM dengan Bearer token, lalu query status dengan signature HMAC-SHA512. Untuk webhook DOKU, pastikan `webhookPath` sama persis dengan path endpoint publik yang menerima callback, karena path tersebut menjadi bagian dari string-to-sign. Verifikasi webhook menolak timestamp di luar 5 menit secara default (`webhookMaxTimestampSkewMs` atau option `maxTimestampSkewMs`) dan sebaiknya diberi `rawBody` supaya hash signature mengikuti body asli dari DOKU. Seperti Duitku, `parseWebhook()` melempar error bila signature/timestamp tidak valid; `{ throwOnInvalid: false }` mengembalikan hasil aman tanpa status/order palsu.

### Mendukung custom provider (scaling)

Arsitektur gateway sangat scalable. Kamu bisa dengan mudah membawa provider-mu sendiri (misal Biller lain atau gateway internal) tanpa perlu memodifikasi core library. Cukup implementasikan _interface_ `GatewayAdapter` yang wajib menyertakan 4 operasi inti: `createDynamicQr`, `checkPaymentStatus`, `parseWebhook`, dan `pollPaymentStatus`.

Ada dua pendekatan untuk memasang custom adapter:

**1. `gateway.useAdapter()` (Direct Injection)**

Gunakan cara ini untuk melempar instance adapter langsung ke singleton. Sangat cocok jika kamu membuat instance di module sendiri:

```ts
import { gateway, type GatewayAdapter } from "qris-saurus";

class FinpayAdapter implements GatewayAdapter {
  // ...implementasi 4 operasi inti
}

// Pasang adapter langsung
gateway.useAdapter("finpay", new FinpayAdapter(), { apiKey: "secret" });

// Langsung bisa dipakai
await gateway.charge("INV-FIN", 10000); 
```

**2. `Gateway.registerProvider()` (Factory Registration)**

Gunakan cara ini jika kamu membuat library atau helper yang mendaftarkan provider secara global, sehingga nantinya aplikasi kamu hanya perlu memanggil `gateway.configure()`:

```ts
import { Gateway, gateway } from "qris-saurus";

// Daftarkan ke factory bawaan SDK
Gateway.registerProvider("finpay", () => new FinpayAdapter());

// Sekarang bisa dipakai selayaknya provider bawaan
gateway.configure({ 
  provider: "finpay",
  apiKey: "secret" 
} as any); // custom provider belum ada di tipe GatewayConfig
```

## Gateway payments multi-method

Selain QRIS gateway API lama (`charge()` / `createDynamicQr()`), `qris-saurus` sekarang punya fondasi multi-method:

- `gateway.capabilities()` untuk membaca method yang didukung provider.
- `gateway.createPayment()` untuk direct API/custom UI (`qris`, `virtual_account`, `ewallet`).
- Helper typed: `createQrisPayment()`, `createVirtualAccount()`, `createEwallet()`.
- `gateway.createCheckout()` / `gateway.createHostedCheckout()` untuk hosted checkout/payment page provider.
- Webhook tetap menjadi source of truth; redirect dan polling hanya UX/fallback.

```ts
gateway.configure({
  provider: "midtrans",
  serverKey: process.env.MIDTRANS_SERVER_KEY!,
  sandbox: true,
});

const va = await gateway.createVirtualAccount({
  orderId: "INV-VA-001",
  amount: 50_000,
  bank: "bca",
});

const checkout = await gateway.createCheckout({
  orderId: "INV-CO-001",
  amount: 75_000,
  enabledMethods: ["qris", "virtual_account", "ewallet"],
  notificationUrl: "https://merchant.example/webhooks/midtrans",
});
```

Lihat [docs/sdk/payments.md](./docs/sdk/payments.md) untuk detail direct payment vs hosted checkout, capability provider, dan best practice webhook.

## CLI

Setelah build, CLI tersedia sebagai `qris-saurus`.

### Build CLI

```bash
bun run build
```

### Help

```bash
bun run dist/cli.js --help
```

```
qris-saurus CLI

Usage:
  qris-saurus validate [<qris>] [--input-file <file>]
  qris-saurus parse [<qris>] [--input-file <file>]
  qris-saurus detect [<qris>] [--input-file <file>]
  qris-saurus dynamic [<qris>] --amount <number> [--merchant-ref <text>] [--terminal-label <text>] [--input-file <file>]
  qris-saurus render [<qris>] --output <file.png> [--width <number>] [--margin <number>] [--input-file <file>]

Input priority:
  1. positional <qris>
  2. --input-file <file>
  3. stdin pipe
```

### validate

Memeriksa CRC dan tag wajib pada payload.

```bash
bun run dist/cli.js validate "<QRIS_PAYLOAD>"
# atau
bun run dist/cli.js validate --input-file ./payload.txt
```

Output:

```json
{
  "valid": true,
  "errors": []
}
```

Jika ada masalah:

```json
{
  "valid": false,
  "errors": [
    "Invalid CRC value"
  ]
}
```

### parse

Mem-parse payload menjadi struktur TLV.

```bash
bun run dist/cli.js parse "<QRIS_PAYLOAD>"
# atau
cat ./payload.txt | bun run dist/cli.js parse
```

Output:

```json
{
  "raw": "00020101021126360014ID.CO.QRIS.WWW0114GENERICSTORE01520458125303605802ID5911QRIS SAURUS6007JAKARTA63041669",
  "nodes": [
    { "id": "00", "length": 2, "value": "01" },
    { "id": "01", "length": 2, "value": "11" },
    {
      "id": "26",
      "length": 36,
      "value": "0014ID.CO.QRIS.WWW0114GENERICSTORE01",
      "children": [
        { "id": "00", "length": 14, "value": "ID.CO.QRIS.WWW" },
        { "id": "01", "length": 14, "value": "GENERICSTORE01" }
      ]
    },
    { "id": "52", "length": 4, "value": "5812" },
    { "id": "53", "length": 3, "value": "360" },
    { "id": "58", "length": 2, "value": "ID" },
    { "id": "59", "length": 11, "value": "QRIS SAURUS" },
    { "id": "60", "length": 7, "value": "JAKARTA" }
  ],
  "crc": "1669"
}
```

### detect

Mendeteksi provider dari merchant account identifier.

```bash
bun run dist/cli.js detect "<QRIS_PAYLOAD>"
# atau
bun run dist/cli.js detect --input-file ./payload.txt
```

Jika provider dikenali (contoh ShopeePay):

```json
{
  "code": "shopeepay",
  "name": "ShopeePay",
  "aliases": ["shopeepay", "shopee pay"],
  "merchantInfoTagIds": ["26", "27", "28", "..."],
  "identifiers": ["shopee"],
  "supportsApiDynamic": false,
  "notes": "Standalone public dynamic QRIS API evidence is limited; use local QRIS transformation by default."
}
```

Jika tidak dikenali:

```json
null
```

### dynamic

Mengubah QRIS statis menjadi dinamis dengan nominal transaksi.

```bash
bun run dist/cli.js dynamic "<QRIS_PAYLOAD>" --amount 25000 --merchant-ref INV-001 --terminal-label POS-A
# atau
cat ./payload.txt | bun run dist/cli.js dynamic --amount 25000 --merchant-ref INV-001
```

Output adalah string payload QRIS dinamis baru, siap dirender:

```
00020101021226360014ID.CO.QRIS.WWW0114GENERICSTORE01520458125303360540825000.005802ID5911QRIS SAURUS6007JAKARTA62200507INV-0010705POS-A6304391F
```

Perbedaan dari payload asli:
- tag `01` berubah dari `11` → `12` (static → dynamic)
- tag `54` ditambahkan dengan nominal `25000.00`
- tag `62` ditambahkan dengan `merchantRef` dan `terminalLabel`
- tag `63` (CRC) dihitung ulang

### render

Membuat file PNG dari payload QRIS.

```bash
bun run dist/cli.js render "<QRIS_PAYLOAD>" --output ./qris.png --width 320 --margin 2
# atau
cat ./payload.txt | bun run dist/cli.js render --output ./qris.png
```

Output adalah path file PNG yang berhasil dibuat:

```
./qris.png
```

## Rendering dari library

### Simpan ke file

```ts
import { renderQrToFile } from "qris-saurus";

await renderQrToFile(qrisPayload, "./qris.png", { width: 320, margin: 2 });
// → file ./qris.png tersimpan
```

### Output sebagai Base64 data URL

```ts
import { renderQrToDataUrl } from "qris-saurus";

const dataUrl = await renderQrToDataUrl(qrisPayload, { width: 320 });
console.log(dataUrl);
// data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAAFACAYAAADNkKWqAAAAAklEQVR4Ae...
```

Hasil `dataUrl` langsung bisa dipakai di HTML:

```html
<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAAFACAYAAADNkKWqAAAAAklEQVR4Ae..." />
```

Atau dikirim sebagai JSON response:

```ts
return Response.json({ qrImage: dataUrl });
```

Helper ini berguna kalau kamu ingin:
- menampilkan preview QR di web/app internal
- menyimpan QR image ke file
- mengirim hasil render ke pipeline lain setelah payload selesai dibentuk

## API tersedia

**Inti:**
- `parse(qrisString)` — string → TLV nodes
- `serialize(qrisData)` — TLV nodes → string
- `validate(qrisString)` — cek CRC + tag wajib
- `computeCrc(input)` / `verifyCrc(qrisString)`

**Transformasi:**
- `staticToDynamic(qrisString, options)` — local transform, return string
- `makeDynamic(qrisString, options)` — local transform + provider detection, return `DynamicResult`

**Provider:**
- `detectProvider(qrisString)` — return `ProviderAdapter | null`
- `listProviders()` — return semua provider terdaftar

**Gateway adapters:**
- `midtransAdapter.createDynamicQr(options, config, notificationOptions?)` — buat QR via Midtrans API, dengan opsi override/append webhook per transaksi
- `midtransAdapter.checkPaymentStatus(orderId, config)` — cek status pembayaran
- `midtransAdapter.verifyWebhook(payload, config)` / `parseWebhook(payload, config)` / `getWebhookStatus(payload)` — validasi dan normalisasi webhook Midtrans
- `xenditAdapter.createDynamicQr(options, config)` — buat QR via Xendit API
- `xenditAdapter.checkPaymentStatus(gatewayOrderId, config)` — cek status pembayaran
- `xenditAdapter.parseWebhook(payload, config, headers)` — validasi callback token dan normalisasi webhook Xendit
- `duitkuAdapter.createDynamicQr(options, config)` — buat QR via Duitku Direct API
- `duitkuAdapter.checkPaymentStatus(orderId, config)` — cek status pembayaran Duitku
- `duitkuAdapter.parseWebhook(payload, config)` — validasi HMAC-SHA256 dan normalisasi callback Duitku
- `dokuAdapter.createDynamicQr(options, config)` — buat QR via DOKU SNAP QRIS MPM Generate
- `dokuAdapter.checkPaymentStatus(orderId, config)` — cek status pembayaran DOKU SNAP QRIS MPM Query
- `dokuAdapter.parseWebhook(payload, config, headers)` — validasi HMAC-SHA512 SNAP dan normalisasi webhook DOKU

**Render:**
- `renderQrToDataUrl(qrisString, options?)` — return Base64 PNG data URL
- `renderQrToFile(qrisString, outputPath, options?)` — simpan ke file PNG

## Prioritas input CLI

CLI menerima input dengan urutan prioritas:
1. argumen langsung
2. `--input-file <file>`
3. stdin / pipe

```bash
# 1 — argumen langsung
bun run dist/cli.js validate "00020101021126..."

# 2 — dari file
bun run dist/cli.js dynamic --input-file payload.txt --amount 25000

# 3 — dari stdin / pipe
cat payload.txt | bun run dist/cli.js render --output qris.png
```

## Pengembangan

```bash
bun install
bun test
bun run typecheck
bun run build
```

## Dokumentasi

Lihat folder [`docs`](./docs):

- [`docs/sdk/index.md`](./docs/sdk/index.md) — overview SDK & quick start
- [`docs/sdk/api.md`](./docs/sdk/api.md) — full API reference
- [`docs/sdk/workflow.md`](./docs/sdk/workflow.md) — panduan alur end-to-end
- [`docs/sdk/gateway.md`](./docs/sdk/gateway.md) — gateway adapters & cek status pembayaran
- [`docs/architecture.md`](./docs/architecture.md) — desain internal library
- [`docs/qris-dynamic.md`](./docs/qris-dynamic.md) — teknis QRIS dinamis & TLV
- [`docs/providers.md`](./docs/providers.md) — catatan per provider
- [`docs/cli.md`](./docs/cli.md) — panduan CLI lengkap


