<div align="center">

# qris-saurus

![qris-saurus hero](./qris-saurus-hero.png)

Bun/TypeScript SDK untuk parse, validasi, deteksi provider, dan transformasi QRIS statis menjadi QRIS dinamis.

[![npm version](https://img.shields.io/npm/v/qris-saurus?style=flat-square&color=blue)](https://npmjs.com/package/qris-saurus)
[![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![ci status](https://img.shields.io/github/actions/workflow/status/creasico/qris-saurus/ci.yml?branch=main&style=flat-square)](https://github.com/creasico/qris-saurus/actions)
[![bun](https://img.shields.io/badge/bun-1.3.13+-512e15?style=flat-square&logo=bun)](https://bun.sh)

</div>

[English](./README.en.md) | Indonesian

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

## Static vs dynamic QRIS

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

Untuk fase sekarang, fokus utama library ini adalah **transformasi lokal** dari QRIS statis menjadi QRIS dinamis yang valid. Integrasi API gateway seperti Midtrans/Xendit/Duitku bisa ditambahkan kemudian sebagai layer terpisah.

## Goals

- Mengubah QRIS statis menjadi QRIS dinamis secara lokal
- Memastikan payload tetap valid dengan CRC yang benar
- Menyediakan fondasi provider-aware untuk ShopeePay, GoPay, Midtrans, Xendit, dan Duitku
- Mudah di-import dari project Bun/TypeScript lain

## How It Works

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

### Proses konversi static → dynamic

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

### Key QRIS Tags

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

## Install

```bash
bun install
```

## Configure Environment

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
```

Gunakan dalam kode:

```ts
import { midtransAdapter, xenditAdapter, duitkuAdapter } from "qris-saurus";

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
};
```

## Quick start

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

## Error Handling

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
  );
  console.log(result.qrisString);
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

## Available API

**Core:**
- `parse(qrisString)` — string → TLV nodes
- `serialize(qrisData)` — TLV nodes → string
- `validate(qrisString)` — cek CRC + tag wajib
- `computeCrc(input)` / `verifyCrc(qrisString)`

**Transform:**
- `staticToDynamic(qrisString, options)` — local transform, return string
- `makeDynamic(qrisString, options)` — local transform + provider detection, return `DynamicResult`

**Providers:**
- `detectProvider(qrisString)` — return `ProviderAdapter | null`
- `listProviders()` — return semua provider terdaftar

**Gateway adapters:**
- `midtransAdapter.createDynamicQr(options, config)` — buat QR via Midtrans API
- `midtransAdapter.checkPaymentStatus(orderId, config)` — cek status pembayaran
- `xenditAdapter.createDynamicQr(options, config)` — buat QR via Xendit API
- `xenditAdapter.checkPaymentStatus(gatewayOrderId, config)` — cek status pembayaran
- `duitkuAdapter.createDynamicQr(options, config)` — buat QR via Duitku API
- `duitkuAdapter.checkPaymentStatus(orderId, config)` — cek status pembayaran

**Render:**
- `renderQrToDataUrl(qrisString, options?)` — return Base64 PNG data URL
- `renderQrToFile(qrisString, outputPath, options?)` — simpan ke file PNG

## CLI input priority

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

## Development

```bash
bun install
bun test
bun run typecheck
bun run build
```

## Documentation

Lihat folder [`docs`](./docs):

- [`docs/sdk/index.md`](./docs/sdk/index.md) — overview SDK & quick start
- [`docs/sdk/api.md`](./docs/sdk/api.md) — full API reference
- [`docs/sdk/workflow.md`](./docs/sdk/workflow.md) — panduan alur end-to-end
- [`docs/sdk/gateway.md`](./docs/sdk/gateway.md) — gateway adapters & cek status pembayaran
- [`docs/architecture.md`](./docs/architecture.md) — desain internal library
- [`docs/qris-dynamic.md`](./docs/qris-dynamic.md) — teknis QRIS dinamis & TLV
- [`docs/providers.md`](./docs/providers.md) — catatan per provider
- [`docs/cli.md`](./docs/cli.md) — panduan CLI lengkap


