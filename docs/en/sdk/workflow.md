# Workflow Guide

English | [Bahasa Indonesia](../../sdk/workflow.md)

This guide explains end-to-end `qris-saurus` usage for several practical scenarios.

---

## Scenario 1 — POS / cashier (local transform)

The merchant already has a static QRIS payload from the acquirer. The cashier enters the amount, and the system shows a new QR for each transaction.

**Implementation example:**

```ts
import {
  validate,
  makeDynamic,
  renderQrToDataUrl,
} from "qris-saurus";

const MERCHANT_QRIS_STATIC = process.env.MERCHANT_QRIS_STATIC;
if (!MERCHANT_QRIS_STATIC) {
  throw new Error("MERCHANT_QRIS_STATIC environment variable is required");
}
const STATIC_QRIS = MERCHANT_QRIS_STATIC;

export async function createCheckoutQr(orderId: string, amount: number) {
  const check = validate(STATIC_QRIS);
  if (!check.valid) throw new Error(`Invalid QRIS: ${check.errors.join(", ")}`);

  const result = makeDynamic(STATIC_QRIS, {
    amount,
    merchantRef: orderId,
    terminalLabel: "POS-01",
  });

  const image = await renderQrToDataUrl(result.qrisString, { width: 400 });

  return {
    provider: result.provider,
    qrisString: result.qrisString,
    qrImage: image,
  };
}
```

---

## Scenario 2 — Invoice / e-commerce (local transform)

The system creates an invoice, then embeds the QR into a PDF or checkout page.

```ts
import { staticToDynamic, renderQrToFile } from "qris-saurus";
import path from "path";

export async function generateInvoiceQr(invoice: Invoice) {
  const qrisString = staticToDynamic(STATIC_QRIS, {
    amount: invoice.totalAmount,
    merchantRef: invoice.id,
    tipType: invoice.serviceFeeType,
    tipValue: invoice.serviceFeeValue,
  });

  const outputPath = path.join("./qr-output", `${invoice.id}.png`);
  await renderQrToFile(qrisString, outputPath, { width: 512 });

  return { qrisString, imagePath: outputPath };
}
```

---

## Scenario 3 — Inspecting a QRIS payload (debug / validation)

You received a QRIS string from another system and want to understand its contents before proceeding.

```ts
import { parse, detectProvider, validate } from "qris-saurus";

function inspectQris(qrisString: string) {
  const check = validate(qrisString);
  console.log("Valid:", check.valid);
  if (!check.valid) {
    console.log("Errors:", check.errors);
    return;
  }

  const data = parse(qrisString);
  const nodes = data.nodes;

  const getTag = (id: string) => nodes.find(n => n.id === id)?.value;

  console.log({
    method: getTag("01") === "12" ? "dynamic" : "static",
    merchantName: getTag("59"),
    merchantCity: getTag("60"),
    currency: getTag("53"),
    amount: getTag("54") ?? "(not present, static)",
    mcc: getTag("52"),
  });

  const provider = detectProvider(qrisString);
  console.log("Provider:", provider?.info.name ?? "unrecognized");
}
```

---

## Scenario 4 — Batch generation (multiple transactions)

Generate multiple dynamic QRIS payloads from one static QRIS.

```ts
import { staticToDynamic, renderQrToFile } from "qris-saurus";

const orders = [
  { id: "ORD-001", amount: 50_000 },
  { id: "ORD-002", amount: 125_000 },
  { id: "ORD-003", amount: 75_500 },
];

const STATIC_QRIS = "...";

async function batchGenerate() {
  const results = await Promise.all(
    orders.map(async (order) => {
      const qrisString = staticToDynamic(STATIC_QRIS, {
        amount: order.amount,
        merchantRef: order.id,
      });

      const imagePath = `./qr/${order.id}.png`;
      await renderQrToFile(qrisString, imagePath, { width: 320 });

      return { orderId: order.id, qrisString, imagePath };
    })
  );

  return results;
}
```

---

## Scenario 5 — Hono / Express / Elysia integration

Serve QR data through a REST API:

```ts
import { Hono } from "hono";
import { makeDynamic, renderQrToDataUrl, validate } from "qris-saurus";

const app = new Hono();
const MERCHANT_QRIS = process.env.MERCHANT_QRIS;
if (!MERCHANT_QRIS) {
  throw new Error("MERCHANT_QRIS environment variable is required");
}
const STATIC_QRIS = MERCHANT_QRIS;

app.post("/payment/qr", async (c) => {
  const { amount, orderId } = await c.req.json<{
    amount: number;
    orderId: string;
  }>();

  if (!amount || amount <= 0) {
    return c.json({ error: "Invalid amount" }, 400);
  }

  const check = validate(STATIC_QRIS);
  if (!check.valid) {
    return c.json({ error: "Invalid merchant QRIS configuration" }, 500);
  }

  const result = makeDynamic(STATIC_QRIS, {
    amount,
    merchantRef: orderId,
  });

  const qrImage = await renderQrToDataUrl(result.qrisString);

  return c.json({
    orderId,
    amount,
    provider: result.provider,
    qrisString: result.qrisString,
    qrImage,
  });
});

export default app;
```

---

## Best practices

1. **Store static QRIS in an env var** — do not hardcode it.
2. **Validate once at startup** — not on every request.
3. **Never modify QRIS strings manually** — always use `parse → transform → serialize`.
4. **Use a unique `merchantRef` per transaction**.
5. **Let the library format amounts** — just pass numbers.
6. **Use tip fields deliberately** depending on your checkout model.
