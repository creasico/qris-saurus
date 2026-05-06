# Architecture

`qris-saurus` dibagi menjadi dua lapisan utama:

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

## 2. Provider layer

Lapisan ini bertanggung jawab untuk:

- deteksi provider berdasarkan merchant account info
- menyimpan metadata/caveat provider
- menyiapkan fondasi integrasi API provider di fase berikutnya

Komponen utamanya:

- `src/providers/base.ts`
- `src/providers/registry.ts`
- `src/providers/*.ts`

## Design principles

- selalu gunakan alur parse → validate → transform → serialize
- jangan manipulasi string payload secara manual
- pisahkan transformasi lokal dari integrasi API gateway
- pertahankan API publik tetap kecil dan mudah dipakai
