# qris-saurus SDK

Bun/TypeScript library untuk mengubah QRIS statis menjadi dinamis — dengan dukungan deteksi provider, validasi CRC, dan rendering QR image.

## Daftar isi

- [qris-saurus SDK](#qris-saurus-sdk)
  - [Daftar isi](#daftar-isi)
  - [Apa ini?](#apa-ini)
  - [Instalasi](#instalasi)
  - [Quick start](#quick-start)
  - [Dua pendekatan](#dua-pendekatan)
    - [A — Local transform (default, tersedia sekarang)](#a--local-transform-default-tersedia-sekarang)
    - [B — Gateway API (tersedia untuk Midtrans, Xendit, Duitku)](#b--gateway-api-tersedia-untuk-midtrans-xendit-duitku)
  - [Provider yang didukung](#provider-yang-didukung)
  - [Struktur folder](#struktur-folder)
  - [Dokumentasi lanjutan](#dokumentasi-lanjutan)

---

## Apa ini?

`qris-saurus` adalah SDK yang bekerja di lapisan **payload QRIS** — bukan di lapisan switching jaringan atau settlement. Library ini membantumu:

- mem-parse string QRIS menjadi struktur TLV yang bisa dibaca program
- memvalidasi apakah payload sudah benar (CRC, tag wajib, currency)
- mendeteksi provider dari merchant account identifier
- mengubah QRIS statis menjadi dinamis secara lokal (tanpa API gateway)
- membuat QRIS dinamis via gateway API (Midtrans, Xendit, Duitku)
- mengecek status pembayaran apakah sudah lunas
- merender payload QRIS menjadi QR image PNG atau data URL

---

## Instalasi

```bash
# dari npm registry (setelah publish)
bun add qris-saurus

# dari source
git clone <repo>
cd qris-saurus
bun install
bun run build
```

Setelah `bun run build`, file distribusi ada di `dist/`. Untuk menggunakannya sebagai local package di project lain:

```bash
# di project lain
bun add /path/to/qris-saurus
```

Atau via `package.json`:

```json
{
  "dependencies": {
    "qris-saurus": "file:../qris-saurus"
  }
}
```

---

## Quick start

```ts
import {
  validate,
  parse,
  detectProvider,
  makeDynamic,
  staticToDynamic,
  renderQrToDataUrl,
  renderQrToFile,
} from "qris-saurus";

const staticQris = "00020101021126...6304XXXX"; // QRIS statis milikmu

// 1. Validasi dulu
const result = validate(staticQris);
if (!result.valid) {
  console.error("QRIS tidak valid:", result.errors);
  process.exit(1);
}

// 2. Cek provider (opsional)
const provider = detectProvider(staticQris);
console.log("Provider:", provider?.info.name ?? "tidak dikenali");

// 3. Buat dinamis — dengan deteksi provider otomatis
const dynamic = makeDynamic(staticQris, {
  amount: 50_000,
  merchantRef: "INV-2026-001",
  terminalLabel: "KASIR-A",
});

console.log("Payload dinamis:", dynamic.qrisString);
console.log("Source:", dynamic.source);     // "local"
console.log("Provider:", dynamic.provider); // "shopeepay" / "gopay" / dll

// 4. Render ke image
const dataUrl = await renderQrToDataUrl(dynamic.qrisString);
// dataUrl bisa langsung dipakai di <img src="...">

await renderQrToFile(dynamic.qrisString, "./qris-output.png");
```

---

## Dua pendekatan

`qris-saurus` mendukung dua cara membuat QRIS dinamis:

### A — Local transform (default, tersedia sekarang)

Transformasi dilakukan sepenuhnya di sisi library, tanpa koneksi ke server manapun:

```
QRIS statis
    │
    ▼
parse → validate → transform → serialize
    │
    ▼
QRIS dinamis (string baru dengan CRC valid)
```

Cocok untuk:
- merchant yang sudah punya QRIS statis dari acquirer
- kebutuhan inject nominal untuk POS, invoice, atau checkout internal
- sistem offline atau edge deployment

### B — Gateway API (tersedia untuk Midtrans, Xendit, Duitku)

Meminta QR baru langsung ke gateway:

```
Request (amount, order_id, ...)
    │
    ▼
Gateway API → QR string + expiry + callback URL
    │
    ▼
Render QR untuk user
```

Cocok untuk:
- sistem yang butuh expiry time bawaan gateway
- notifikasi pembayaran via webhook dari gateway
- reconciliation dan refund via dashboard gateway

Lihat [docs/sdk/gateway.md](./gateway.md) untuk panduan lengkap penggunaan adapter dan cek status pembayaran.

---

## Provider yang didukung

| Provider  | Deteksi | Local transform | API adapter      |
| --------- | ------- | --------------- | ---------------- |
| ShopeePay | ✅       | ✅               | —                |
| GoPay     | ✅       | ✅               | — (via Midtrans) |
| Midtrans  | ✅       | ✅               | ✅                |
| Xendit    | ✅       | ✅               | ✅                |
| Duitku    | ✅       | ✅               | ✅                |
| Generic   | —       | ✅               | —                |

Provider dideteksi dari subtag `00` pada merchant account information (tag `26`–`51`). Jika provider tidak dikenali, library tetap melakukan local transform sebagai `"generic"`.

---

## Struktur folder

```
qris-saurus/
├── src/
│   ├── index.ts                  ← entry point library
│   ├── cli.ts                    ← entry point CLI
│   ├── render.ts                 ← QR image renderer
│   ├── core/
│   │   ├── crc.ts                ← CRC16/CCITT verifier & generator
│   │   ├── parser.ts             ← QRIS string → TLV nodes
│   │   ├── serializer.ts         ← TLV nodes → QRIS string
│   │   ├── types.ts              ← shared TypeScript types
│   │   └── validator.ts          ← validasi tag wajib & CRC
│   ├── providers/
│   │   ├── base.ts               ← ProviderAdapter class
│   │   ├── registry.ts           ← detectProvider, makeDynamic, listProviders
│   │   ├── shopeepay.ts
│   │   ├── gopay.ts
│   │   ├── midtrans.ts
│   │   ├── xendit.ts
│   │   ├── duitku.ts
│   │   └── adapters/
│   │       ├── types.ts          ← MidtransConfig, XenditConfig, DuitkuConfig
│   │       ├── midtrans.ts       ← MidtransAdapter + midtransAdapter
│   │       ├── xendit.ts         ← XenditAdapter + xenditAdapter
│   │       └── duitku.ts         ← DuitkuAdapter + duitkuAdapter
│   ├── transform/
│   │   ├── static-to-dynamic.ts  ← transformasi utama
│   │   └── normalizer.ts
│   └── utils/
│       └── tlv.ts                ← TLV read/write primitives
├── docs/
│   ├── architecture.md
│   ├── cli.md
│   ├── providers.md
│   ├── qris-dynamic.md
│   └── sdk/
│       ├── index.md              ← dokumen ini
│       ├── api.md                ← full API reference
│       ├── workflow.md           ← end-to-end workflow guide
│       └── gateway.md            ← gateway adapters & cek status pembayaran
└── tests/
    ├── core/
    ├── providers/
    ├── transform/
    ├── fixtures/
    └── render.test.ts
```

---

## Dokumentasi lanjutan

| Dokumen                                  | Isi                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------- |
| [api.md](./api.md)                       | Referensi lengkap semua fungsi dan tipe yang diekspor               |
| [workflow.md](./workflow.md)             | Panduan alur end-to-end untuk berbagai use case                     |
| [gateway.md](./gateway.md)               | Penggunaan adapter Midtrans, Xendit, Duitku + cek status pembayaran |
| [../architecture.md](../architecture.md) | Desain internal library (core engine + provider layer)              |
| [../qris-dynamic.md](../qris-dynamic.md) | Teknis QRIS dinamis dan TLV tag yang terlibat                       |
| [../providers.md](../providers.md)       | Catatan khusus per provider                                         |
| [../cli.md](../cli.md)                   | Panduan penggunaan CLI                                              |
