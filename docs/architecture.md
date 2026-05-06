# Architecture

[English](./en/architecture.md) | Indonesian

`qris-saurus` dibagi menjadi dua lapisan utama.

## 1. Core QRIS engine

Lapisan ini provider-agnostic dan bertanggung jawab untuk:

- membaca payload QRIS dalam format TLV
- memvalidasi tag wajib
- memverifikasi CRC
- mengubah QRIS statis menjadi dinamis
- menulis ulang payload dengan CRC baru

Komponen utamanya:

- `src/utils/tlv.ts`
- `src/core/crc.ts`
- `src/core/parser.ts`
- `src/core/serializer.ts`
- `src/core/validator.ts`
- `src/transform/static-to-dynamic.ts`
- `src/render.ts`

`src/render.ts` berada di atas payload layer. Ia tidak mengubah struktur QRIS, hanya mengubah string payload yang sudah valid menjadi representasi gambar QR.

### Internal flow

Alur internal yang dipakai library:

1. `parse(qrisString)`
   - memecah string menjadi node TLV
2. `validate(qrisString)`
   - memastikan CRC dan tag penting tetap konsisten
3. `detectProvider(qrisString)`
   - membaca merchant account info dan mencoba mengenali provider
4. `staticToDynamic(qrisString, options)`
   - mengubah tag yang dibutuhkan untuk transaksi dinamis
5. `serialize(data)`
   - membentuk string baru dan menghitung ulang CRC

### Kenapa tidak manipulasi string langsung?

Karena payload QRIS sensitif terhadap posisi, panjang field, dan CRC. Mengubah string secara manual rawan menghasilkan payload yang terlihat benar tapi gagal diproses scanner atau gateway.

## 2. Provider layer

Lapisan ini bertanggung jawab untuk:

- deteksi provider berdasarkan merchant account info
- menyimpan metadata/caveat provider
- menyediakan adapter untuk local transform dan gateway API

Komponen utamanya:

- `src/providers/base.ts`
- `src/providers/registry.ts`
- `src/providers/*.ts`
- `src/providers/adapters/types.ts`
- `src/providers/adapters/midtrans.ts`
- `src/providers/adapters/xendit.ts`
- `src/providers/adapters/duitku.ts`

## Hubungan dengan gateway

Penting untuk dibedakan:

- **local payload transformation**: bekerja pada string QRIS yang sudah ada, tanpa koneksi internet, sync — via `staticToDynamic()` / `makeDynamic()`
- **gateway QR generation**: meminta QR baru langsung ke Midtrans/Xendit/Duitku, async — via `midtransAdapter`, `xenditAdapter`, `duitkuAdapter`

Kedua pendekatan ini tersedia dan bisa dipilih sesuai kebutuhan. Lihat [docs/sdk/gateway.md](./sdk/gateway.md) untuk panduan kapan memakai masing-masing.

## Design principles

- selalu gunakan alur parse → validate → transform → serialize
- jangan manipulasi string payload secara manual
- pisahkan transformasi lokal dari integrasi API gateway
- pertahankan API publik tetap kecil dan mudah dipakai
- gunakan fixture dan test untuk memastikan CRC dan struktur payload tetap valid
