# qris-saurus SDK

English | [Indonesian](../../sdk/index.md)

A Bun/TypeScript library for turning static QRIS into dynamic QRIS — with provider detection, CRC validation, and QR image rendering.

## Table of contents

- [qris-saurus SDK](#qris-saurus-sdk)
  - [Table of contents](#table-of-contents)
  - [What is this?](#what-is-this)
  - [Installation](#installation)
  - [Quick start](#quick-start)
  - [Two approaches](#two-approaches)
    - [A — Local transform (default, available now)](#a--local-transform-default-available-now)
    - [B — Gateway API (available for Midtrans, Xendit, Duitku)](#b--gateway-api-available-for-midtrans-xendit-duitku)
  - [Supported providers](#supported-providers)
  - [Folder structure](#folder-structure)
  - [Further documentation](#further-documentation)

---

## What is this?

`qris-saurus` is an SDK that operates at the **QRIS payload** layer — not the network switching or settlement layer. This library helps you:

- parse QRIS strings into TLV structures that are easy for programs to read
- validate whether the payload is correct (CRC, required tags, currency)
- detect providers from merchant account identifiers
- transform static QRIS into dynamic QRIS locally (without a gateway API)
- create dynamic QRIS through gateway APIs (Midtrans, Xendit, Duitku)
- check whether a payment has been completed
- render QRIS payloads into PNG QR images or data URLs

---

## Installation

```bash
# from the npm registry (after publishing)
bun add qris-saurus

# from source
git clone https://github.com/creasico/qris-saurus.git
cd qris-saurus
bun install
bun run build
```

After `bun run build`, the distribution files are available in `dist/`. To use it as a local package in another project:

```bash
# in another project
bun add /path/to/qris-saurus
```

Or via `package.json`:

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
  renderQrToDataUrl,
  renderQrToFile,
} from "qris-saurus";

const staticQris = "00020101021126...6304XXXX"; // your static QRIS

const result = validate(staticQris);
if (!result.valid) {
  console.error("Invalid QRIS:", result.errors);
  process.exit(1);
}

const provider = detectProvider(staticQris);
console.log("Provider:", provider?.info.name ?? "unrecognized");

const dynamic = makeDynamic(staticQris, {
  amount: 50_000,
  merchantRef: "INV-2026-001",
  terminalLabel: "KASIR-A",
});

console.log("Dynamic payload:", dynamic.qrisString);
console.log("Source:", dynamic.source);
console.log("Provider:", dynamic.provider);

const dataUrl = await renderQrToDataUrl(dynamic.qrisString);
await renderQrToFile(dynamic.qrisString, "./qris-output.png");
```

---

## Two approaches

`qris-saurus` supports two ways to create dynamic QRIS:

### A — Local transform (default, available now)

The transformation is performed entirely inside the library, without connecting to any external server:

```
Static QRIS
    │
    ▼
parse → validate → transform → serialize
    │
    ▼
Dynamic QRIS (new string with a valid CRC)
```

Suitable for:
- merchants that already have a static QRIS from an acquirer
- systems that only need to inject an amount for POS, invoices, or internal checkout
- offline systems or edge deployments

### B — Gateway API (available for Midtrans, Xendit, Duitku)

Requests a new QR directly from the gateway:

```
Request (amount, order_id, ...)
    │
    ▼
Gateway API → QR string + expiry + callback URL
    │
    ▼
Render the QR for the user
```

Suitable for:
- systems that need gateway-managed expiry times
- payment notifications via gateway webhooks
- reconciliation and refunds through the gateway dashboard

See [docs/en/sdk/gateway.md](./gateway.md) for a complete guide to adapter usage and payment status checks.

---

## Supported providers

| Provider  | Detection | Local transform | API adapter      |
| --------- | --------- | --------------- | ---------------- |
| ShopeePay | ✅        | ✅              | —                |
| GoPay     | ✅        | ✅              | — (via Midtrans) |
| Midtrans  | ✅        | ✅              | ✅               |
| Xendit    | ✅        | ✅              | ✅               |
| Duitku    | ✅        | ✅              | ✅               |
| Generic   | —         | ✅              | —                |

Providers are detected from subtag `00` inside merchant account information (tags `26`–`51`). If no provider is recognized, the library still performs a local transform as `"generic"`.

---

## Folder structure

```text
qris-saurus/
├── src/
│   ├── index.ts
│   ├── cli.ts
│   ├── render.ts
│   ├── core/
│   ├── providers/
│   ├── transform/
│   └── utils/
├── docs/
│   ├── architecture.md
│   ├── cli.md
│   ├── providers.md
│   ├── qris-dynamic.md
│   ├── en/
│   │   ├── architecture.md
│   │   ├── cli.md
│   │   ├── providers.md
│   │   ├── qris-dynamic.md
│   │   └── sdk/
│   │       ├── index.md
│   │       ├── api.md
│   │       ├── workflow.md
│   │       └── gateway.md
│   └── sdk/
│       ├── index.md
│       ├── api.md
│       ├── workflow.md
│       └── gateway.md
└── tests/
```

---

## Further documentation

| Document                                     | Contents                                                      |
| -------------------------------------------- | ------------------------------------------------------------- |
| [api.md](./api.md)                           | Full reference for all exported functions and types           |
| [workflow.md](./workflow.md)                 | End-to-end workflow guide for different use cases             |
| [gateway.md](./gateway.md)                   | Midtrans, Xendit, Duitku adapter usage + payment status checks |
| [../architecture.md](../architecture.md)     | Internal library design (core engine + provider layer)        |
| [../qris-dynamic.md](../qris-dynamic.md)     | Dynamic QRIS details and related TLV tags                     |
| [../providers.md](../providers.md)           | Provider-specific notes                                       |
| [../cli.md](../cli.md)                       | CLI usage guide                                               |
