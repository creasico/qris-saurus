# ElysiaJS e-catalog example

Contoh app consumer `qris-saurus` berbasis ElysiaJS untuk flow e-catalog sederhana: list produk, buat order, generate pembayaran QRIS, cek status pembayaran, membuka simulasi checkout HTML, dan mencoba webhook gateway.

## Install

```bash
cd examples/elysiajs
bun add qris-saurus@file:../..
bun install
```

Pada repo ini dependency sudah dicatat sebagai package dependency consumer (`qris-saurus`), sehingga app tidak import dari `../../src`. Saat dipakai di luar repo ini, ganti menjadi `bun add qris-saurus`.

## Environment

Salin `.env.example` ke `.env`, lalu isi minimal:

```bash
MERCHANT_QRIS_STATIC="<payload qris statis merchant tanpa newline>"
PAYMENT_MODE=auto
```

Mode yang tersedia:
- `auto`: pilih gateway dari provider QRIS bila kredensial tersedia, kalau tidak fallback ke local transform
- `local`: selalu pakai transform lokal
- `midtrans`
- `xendit`
- `duitku`

## Run

```bash
bun run start
```

Buka `http://localhost:3000/` untuk simulasi checkout HTML sederhana.

## API flow

### HTML simulation

- `GET /` menampilkan halaman checkout sederhana
- Halaman ini memakai endpoint REST yang sama untuk create order, generate QRIS, dan refresh status

### Webhook simulation

- `POST /webhooks/midtrans`
- `POST /webhooks/xendit`
- `POST /webhooks/duitku`

Untuk Xendit, sertakan header `x-callback-token` yang sama dengan `XENDIT_CALLBACK_TOKEN`.

Contoh:

```bash
curl -X POST http://localhost:3000/webhooks/xendit \
  -H 'content-type: application/json' \
  -H 'x-callback-token: <XENDIT_CALLBACK_TOKEN>' \
  -d '{"reference_id":"ORD-...","status":"SUCCEEDED"}'
```

```bash
curl -X POST http://localhost:3000/webhooks/midtrans \
  -H 'content-type: application/json' \
  -d '{"order_id":"ORD-...","transaction_status":"settlement","status_code":"200","gross_amount":"150000.00","signature_key":"<valid_signature>"}'
```

```bash
curl -X POST http://localhost:3000/webhooks/duitku \
  -H 'content-type: application/json' \
  -d '{"merchantOrderId":"ORD-...","statusCode":"00","merchantCode":"<merchant_code>","amount":"150000","signature":"<valid_signature>"}'
```

Route webhook akan memverifikasi signature/token lebih dulu sebelum mengubah status order.



Contoh body simulasi:

```json
{
  "order_id": "ORD-...",
  "transaction_status": "settlement"
}
```

```json
{
  "reference_id": "ORD-...",
  "status": "SUCCEEDED"
}
```

```json
{
  "merchantOrderId": "ORD-...",
  "statusCode": "00"
}
```

## API flow

### 1. List products

```bash
curl http://localhost:3000/products
```

### 2. Create order

```bash
curl -X POST http://localhost:3000/orders \
  -H 'content-type: application/json' \
  -d '{
    "customerEmail": "buyer@example.com",
    "items": [
      { "productId": "arabica-gayo-250g", "quantity": 1 },
      { "productId": "drip-bag-starter-pack", "quantity": 2 }
    ]
  }'
```

### 3. Create QRIS payment

```bash
curl -X POST http://localhost:3000/orders/<ORDER_ID>/payments/qris
```

Response mengandung `qrisString`, `qrDataUrl`, `provider`, `source`, `gatewayOrderId?`, `expiresAt?`, dan untuk Midtrans juga dapat memuat `qrImageUrl` (serta `qrImageUrlV2` di raw gateway result).

### 4. Check payment status

```bash
curl http://localhost:3000/orders/<ORDER_ID>/payments/qris/status
```

## Notes

- Local mode memakai `makeDynamic()` / `staticToDynamic()` dan merender QR ke data URL dengan `renderQrToDataUrl()`.
- Gateway mode memakai adapter publik `midtransAdapter`, `xenditAdapter`, atau `duitkuAdapter` dari package `qris-saurus`.
- Integrasi Midtrans di example sekarang memakai field typed `qrImageUrl` dari adapter dan `midtransAdapter.parseWebhook()` untuk validasi + normalisasi webhook.
- Data produk dan order disimpan in-memory agar contoh tetap fokus ke integrasi package.
