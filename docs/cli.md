# CLI Usage

`qris-saurus` menyediakan CLI sederhana untuk inspeksi dan transformasi payload QRIS.

## Build

```bash
bun run build
```

## Commands

### Validate

```bash
bun run dist/cli.js validate "<QRIS_PAYLOAD>"
```

Output berupa JSON:

```json
{
  "valid": true,
  "errors": []
}
```

### Parse

```bash
bun run dist/cli.js parse "<QRIS_PAYLOAD>"
```

Output berupa struktur TLV hasil parsing.

### Detect provider

```bash
bun run dist/cli.js detect "<QRIS_PAYLOAD>"
```

Jika provider dikenali, output berisi metadata provider.

### Convert to dynamic

```bash
bun run dist/cli.js dynamic "<QRIS_PAYLOAD>" --amount 12500 --merchant-ref INV-001 --terminal-label POS-A
```

Output berupa payload QRIS baru yang sudah:
- memakai point of initiation dynamic
- membawa nominal transaksi
- membawa additional data bila diberikan
- memiliki CRC baru yang valid

## Example workflow

1. ambil payload QRIS statis
2. jalankan `validate`
3. jalankan `detect`
4. jalankan `dynamic`
5. gunakan output string hasil `dynamic` untuk dirender ke QR image di sistem Anda
