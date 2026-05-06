# CLI Usage

`qris-saurus` menyediakan CLI sederhana untuk inspeksi dan transformasi payload QRIS.

## Build

```bash
bun run build
```

Setelah build, file CLI ada di `dist/cli.js`.

## Input modes

CLI menerima payload QRIS dari tiga sumber:

1. argumen langsung
2. `--input-file <file>`
3. stdin / pipe

Prioritasnya adalah argumen langsung, lalu file, lalu stdin.

## Commands

### Validate

```bash
bun run dist/cli.js validate "<QRIS_PAYLOAD>"
```

```bash
bun run dist/cli.js validate --input-file ./payload.txt
```

```bash
cat ./payload.txt | bun run dist/cli.js validate
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

```bash
cat ./payload.txt | bun run dist/cli.js parse
```

Output berupa struktur TLV hasil parsing.

### Detect provider

```bash
bun run dist/cli.js detect "<QRIS_PAYLOAD>"
```

```bash
bun run dist/cli.js detect --input-file ./payload.txt
```

Jika provider dikenali, output berisi metadata provider.

### Convert to dynamic

```bash
bun run dist/cli.js dynamic "<QRIS_PAYLOAD>" --amount 12500 --merchant-ref INV-001 --terminal-label POS-A
```

```bash
cat ./payload.txt | bun run dist/cli.js dynamic --amount 12500 --merchant-ref INV-001
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

```bash
cat ./payload.txt | bun run dist/cli.js render --output ./qris.png
```

Output command ini adalah path file PNG yang berhasil dibuat.

## Example workflow

1. ambil payload QRIS statis
2. jalankan `validate`
3. jalankan `detect`
4. jalankan `dynamic`
5. ambil payload hasil lalu render jadi image, atau render payload langsung dengan `render`
6. gunakan file PNG di UI, POS, invoice, atau sistem internal Anda
