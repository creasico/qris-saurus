# qris-saurus

Bun/TypeScript SDK untuk parse, validasi, deteksi provider, dan transformasi QRIS statis menjadi QRIS dinamis.

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

## Install

```bash
bun install
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

## CLI

Setelah build, CLI tersedia sebagai `qris-saurus`.

### Build CLI

```bash
bun run build
```

### Validate payload

```bash
bun run dist/cli.js validate "<QRIS_PAYLOAD>"
```

```bash
bun run dist/cli.js validate --input-file ./payload.txt
```

### Parse payload

```bash
bun run dist/cli.js parse "<QRIS_PAYLOAD>"
```

```bash
cat ./payload.txt | bun run dist/cli.js parse
```

### Detect provider

```bash
bun run dist/cli.js detect "<QRIS_PAYLOAD>"
```

```bash
bun run dist/cli.js detect --input-file ./payload.txt
```

### Convert static QRIS to dynamic QRIS

```bash
bun run dist/cli.js dynamic "<QRIS_PAYLOAD>" --amount 12500 --merchant-ref INV-001 --terminal-label POS-A
```

```bash
cat ./payload.txt | bun run dist/cli.js dynamic --amount 12500 --merchant-ref INV-001
```

Output command `dynamic` adalah string QRIS baru yang siap dipakai untuk dirender menjadi QR image.

### Render QR image

```bash
bun run dist/cli.js render "<QRIS_PAYLOAD>" --output ./qris.png --width 320 --margin 2
```

```bash
cat ./payload.txt | bun run dist/cli.js render --output ./qris.png
```

Command ini membuat file PNG dari payload QRIS.

## Rendering dari library

```ts
import { renderQrToDataUrl, renderQrToFile } from "qris-saurus";

const dataUrl = await renderQrToDataUrl(qrisPayload);
await renderQrToFile(qrisPayload, "./qris.png");
```

Helper ini berguna kalau kamu ingin:
- menampilkan preview QR di web/app internal
- menyimpan QR image ke file
- mengirim hasil render ke pipeline lain setelah payload selesai dibentuk

## Available API

- `parse(qrisString)`
- `serialize(qrisData)`
- `validate(qrisString)`
- `computeCrc(input)`
- `verifyCrc(qrisString)`
- `staticToDynamic(qrisString, options)`
- `detectProvider(qrisString)`
- `listProviders()`
- `makeDynamic(qrisString, options)`
- `renderQrToDataUrl(qrisString, options?)`
- `renderQrToFile(qrisString, outputPath, options?)`

## Development

```bash
bun install
bun test
bun run typecheck
bun run build
```

## Documentation

Lihat folder [`docs`](./docs):

- [`docs/architecture.md`](./docs/architecture.md)
- [`docs/qris-dynamic.md`](./docs/qris-dynamic.md)
- [`docs/providers.md`](./docs/providers.md)
- [`docs/cli.md`](./docs/cli.md)

## CLI input priority

CLI menerima input dengan urutan prioritas:
1. argumen langsung
2. `--input-file <file>`
3. stdin / pipe

Ini membuat flow seperti berikut jadi bisa dipakai:

```bash
cat payload.txt | qris-saurus render --output qris.png
```

```bash
qris-saurus dynamic --input-file payload.txt --amount 25000
```

```bash
qris-saurus validate "<QRIS_PAYLOAD>"
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

- [`docs/architecture.md`](./docs/architecture.md)
- [`docs/qris-dynamic.md`](./docs/qris-dynamic.md)
- [`docs/providers.md`](./docs/providers.md)
- [`docs/cli.md`](./docs/cli.md)

## Development

Output command `dynamic` adalah string QRIS baru yang siap dipakai untuk dirender menjadi QR image.

### Render QR image

```bash
bun run dist/cli.js render "<QRIS_PAYLOAD>" --output ./qris.png --width 320 --margin 2
```

Command ini membuat file PNG dari payload QRIS.

## Rendering dari library

```ts
import { renderQrToDataUrl, renderQrToFile } from "qris-saurus";

const dataUrl = await renderQrToDataUrl(qrisPayload);
await renderQrToFile(qrisPayload, "./qris.png");
```

Helper ini berguna kalau kamu ingin:
- menampilkan preview QR di web/app internal
- menyimpan QR image ke file
- mengirim hasil render ke pipeline lain setelah payload selesai dibentuk

## Available API

- `parse(qrisString)`
- `serialize(qrisData)`
- `validate(qrisString)`
- `computeCrc(input)`
- `verifyCrc(qrisString)`
- `staticToDynamic(qrisString, options)`
- `detectProvider(qrisString)`
- `listProviders()`
- `makeDynamic(qrisString, options)`
- `renderQrToDataUrl(qrisString, options?)`
- `renderQrToFile(qrisString, outputPath, options?)`

## Development

## Available API

- `parse(qrisString)`
- `serialize(qrisData)`
- `validate(qrisString)`
- `computeCrc(input)`
- `verifyCrc(qrisString)`
- `staticToDynamic(qrisString, options)`
- `detectProvider(qrisString)`
- `listProviders()`
- `makeDynamic(qrisString, options)`

## Development

```bash
bun install
bun test
bun run typecheck
bun run build
```

## Documentation

Lihat folder [`docs`](./docs):

- [`docs/architecture.md`](./docs/architecture.md)
- [`docs/qris-dynamic.md`](./docs/qris-dynamic.md)
- [`docs/providers.md`](./docs/providers.md)
- [`docs/cli.md`](./docs/cli.md)
