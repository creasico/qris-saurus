# Panduan Workflow

[English](../en/sdk/workflow.md) | Bahasa Indonesia

Panduan ini menjelaskan alur end-to-end penggunaan `qris-saurus` untuk berbagai skenario nyata.

---

## Skenario 1 — POS / kasir (transformasi lokal)

Merchant sudah punya QRIS statis dari acquirer. Kasir memasukkan nominal, sistem menampilkan QR baru untuk tiap transaksi.

```
┌──────────────────────────────────────────────────────────────────┐
│  Input: QRIS statis tersimpan di sistem                          │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
                    [ validate() ]
                    Cek CRC + tag wajib
                            │
                     valid? │ tidak valid?
                     ───────┴──────────────────►  tampilkan error, stop
                            │
                            ▼
                  [ detectProvider() ]
                  Cari tahu provider (opsional)
                            │
                            ▼
               [ makeDynamic(qrisString, { amount }) ]
               Inject nominal, ubah tag 01 → 12,
               tulis merchantRef / terminalLabel,
               hitung ulang CRC
                            │
                            ▼
           [ renderQrToDataUrl / renderQrToFile ]
           Generate QR image untuk ditampilkan ke customer
                            │
                            ▼
                   ┌────────────────┐
                   │  Customer scan │
                   └────────────────┘
```

**Contoh implementasi:**

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
  if (!check.valid) throw new Error(`QRIS tidak valid: ${check.errors.join(", ")}`);

  const result = makeDynamic(STATIC_QRIS, {
    amount,
    merchantRef: orderId,
    terminalLabel: "POS-01",
  });

  const image = await renderQrToDataUrl(result.qrisString, { width: 400 });

  return {
    provider: result.provider,
    qrisString: result.qrisString,
    qrImage: image, // embed langsung ke UI
  };
}
```

---

## Skenario 2 — Invoice / e-commerce (transformasi lokal)

Sistem membuat invoice, lalu menyisipkan QR ke PDF atau halaman checkout.

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

## Skenario 3 — Inspeksi payload QRIS (debug / validasi)

Kamu menerima QRIS string dari luar dan ingin tahu isinya sebelum melanjutkan.

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
    currency: getTag("53"), // 360 = IDR
    amount: getTag("54") ?? "(tidak ada, statis)",
    mcc: getTag("52"),
  });

  const provider = detectProvider(qrisString);
  console.log("Provider:", provider?.info.name ?? "tidak dikenali");
}
```

---

## Skenario 4 — Batch generate (multiple transaksi)

Membuat banyak QRIS dinamis sekaligus dari satu QRIS statis:

```ts
import { staticToDynamic, renderQrToFile } from "qris-saurus";

const orders = [
  { id: "ORD-001", amount: 50_000 },
  { id: "ORD-002", amount: 125_000 },
  { id: "ORD-003", amount: 75_500 },
];

const STATIC_QRIS = "..."; // QRIS statis merchantmu

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

## Skenario 5 — Integrasi dengan Hono / Express / Elysia

Menyajikan QR via REST API:

```ts
// Contoh dengan Hono (Bun)
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
    return c.json({ error: "Amount tidak valid" }, 400);
  }

  const check = validate(STATIC_QRIS);
  if (!check.valid) {
    return c.json({ error: "Konfigurasi QRIS merchant tidak valid" }, 500);
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
    qrImage, // Base64 PNG data URL
  });
});

export default app;
```

---

## Alur internal library

Untuk referensi, inilah yang terjadi di dalam `staticToDynamic()`:

```
Input: string QRIS statis
    │
    ▼
parse(qrisString)
    ├── lastIndexOf("6304") → temukan CRC tag
    ├── verifyCrc() → validasi checksum
    └── readTlv() → pecah menjadi TlvNode[]
    │
    ▼
Cek tag 01 ≠ "12" (pastikan belum dinamis)
    │
    ▼
Modifikasi nodes (immutable pattern):
    ├── upsertNode("01", "12")          ← ubah ke dynamic
    ├── upsertNode("54", formatAmount)  ← inject nominal
    ├── tip nodes ("55", "56"/"57") jika diminta
    └── upsertNode("62", additionalData) ← merchantRef, terminalLabel
    │
    ▼
serialize(nodes)
    ├── map nodes ke string TLV
    └── computeCrc() → tambahkan "6304" + 4-digit CRC
    │
    ▼
Output: string QRIS dinamis baru (CRC valid)
```

---

## Tips & praktik terbaik

1. **Simpan QRIS statis di env var** — jangan hardcode di kode sumber.

   ```bash
   MERCHANT_QRIS_STATIC="00020101021126..."
   ```

2. **Validasi sekali saat startup** — periksa QRIS statis saat server baru berjalan, bukan per request.

   ```ts
   const check = validate(process.env.MERCHANT_QRIS_STATIC!);
   if (!check.valid) throw new Error("QRIS merchant tidak valid");
   ```

3. **Jangan modifikasi string QRIS secara manual** — selalu gunakan `parse → transform → serialize`. String QRIS sensitif terhadap posisi, panjang, dan CRC.

4. **`merchantRef` sebaiknya unik per transaksi** — ini yang membedakan QR satu transaksi dengan lainnya di sisi merchant.

5. **Format amount** — library otomatis format ke `"50000.00"` (2 desimal). Kamu cukup kirim angka integer atau float.

6. **Penggunaan tip:** 
   - `tipType: "fixed"` → tag `55 = 02`, nominal di tag `56`
   - `tipType: "percent"` → tag `55 = 03`, persentase di tag `57`
   - `tipType: "none"` (default) → tag `55`, `56`, `57` dihapus
