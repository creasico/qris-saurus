# CLI Usage

`qris-saurus` menyediakan CLI sederhana untuk inspeksi dan transformasi payload QRIS.

## Build

```bash
bun run build
```

Setelah build, file CLI ada di `dist/cli.js`.

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

### Render PNG

```bash
bun run dist/cli.js render "<QRIS_PAYLOAD>" --output ./qris.png --width 320 --margin 2
```

Output command ini adalah path file PNG yang berhasil dibuat.

## Example workflow

1. ambil payload QRIS statis
2. jalankan `validate`
3. jalankan `detect`
4. jalankan `dynamic`
5. ambil payload hasil lalu render jadi image, atau render payload langsung dengan `render`
6. gunakan file PNG di UI, POS, invoice, atau sistem internal Anda
