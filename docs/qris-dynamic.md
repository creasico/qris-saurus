# QRIS Dynamic Notes

## TLV structure

Payload QRIS menggunakan format **Tag-Length-Value**.

Contoh:

```text
5908TOKO ABC
```

Interpretasi:
- `59` = merchant name
- `08` = panjang data
- `TOKO ABC` = nilai field

String QRIS utuh adalah gabungan banyak field TLV yang dibaca berurutan dari kiri ke kanan.

## Tag penting dalam QRIS

- `00`: payload format indicator
- `01`: point of initiation method
- `26`-`51`: merchant account information
- `52`: merchant category code
- `53`: currency
- `54`: amount
- `55`: tip indicator
- `56`: fixed tip amount
- `57`: percentage tip
- `58`: country code
- `59`: merchant name
- `60`: merchant city
- `62`: additional data field template
- `63`: CRC

## Mekanisme QRIS secara praktis

Ketika user memindai QRIS:

1. aplikasi pembayaran membaca payload TLV
2. aplikasi mengenali informasi merchant, currency, dan data transaksi
3. sistem pembayaran menentukan jalur pemrosesan berdasarkan merchant account information
4. user mengonfirmasi pembayaran
5. transaksi diproses oleh issuer/acquirer/gateway sesuai ekosistem masing-masing

`qris-saurus` tidak menggantikan gateway pembayaran. Library ini membantu memastikan payload QRIS yang dibentuk atau dimodifikasi tetap konsisten dan valid.

## Static vs dynamic

### Static QRIS

Biasanya:
- point of initiation method = `11`
- reusable
- belum mengikat nominal transaksi tertentu

### Dynamic QRIS

Biasanya:
- point of initiation method = `12`
- nominal transaksi dibawa di tag `54`
- data tambahan transaksi bisa dibawa di tag `62`
- dibuat untuk satu checkout/order tertentu

## Cara kerja transformasi di library ini

Transformasi `staticToDynamic()` melakukan langkah berikut:

1. parse payload QRIS
2. validasi CRC
3. pastikan payload awal masih statis
4. ubah tag `01` dari `11` menjadi `12`
5. isi atau update tag `54` dengan nominal transaksi
6. isi tag `62` jika `merchantRef` atau `terminalLabel` diberikan
7. tulis ulang payload dan hitung ulang CRC di tag `63`

## Kapan local transform cukup?

Local transform cocok bila:
- merchant sudah punya QRIS payload statis
- kebutuhan utama adalah menempelkan nominal transaksi
- sistem internal hanya perlu payload QR baru untuk ditampilkan ke user

## Kapan gateway API lebih cocok?

Gateway API lebih cocok bila:
- provider mensyaratkan QR dibuat dari sisi server mereka
- butuh expiry time, callback, payment status, atau reconciliation dari gateway
- butuh jaminan bahwa QR tersebut memang terikat ke transaksi pada sistem gateway

## Scope library saat ini

Phase pertama memprioritaskan:
- parser TLV
- validator
- CRC verifier/generator
- static-to-dynamic transformation
- provider detection dasar

Integrasi API Midtrans, Xendit, dan Duitku adalah fase berikutnya.
