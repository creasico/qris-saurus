# qris-saurus

Bun/TypeScript SDK untuk parse, validasi, deteksi provider, dan transformasi QRIS statis menjadi QRIS dinamis.

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
