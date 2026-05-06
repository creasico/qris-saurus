# Provider Notes

## ShopeePay

- dideteksi dari merchant account identifier yang mengandung `shopee`
- untuk saat ini diperlakukan sebagai local QRIS transformation
- bukti publik untuk standalone dynamic QRIS API belum dijadikan fondasi implementasi saat ini

## GoPay

- dideteksi dari merchant account identifier yang mengandung `gopay`
- untuk saat ini diperlakukan sebagai local QRIS transformation
- flow API QRIS bisa berbeda tergantung aggregator atau gateway

## Midtrans

- dideteksi dari merchant account identifier yang mengandung `midtrans`
- mendukung local QRIS transformation untuk payload yang sudah ada
- API adapter tersedia: `midtransAdapter.createDynamicQr()` dan `midtransAdapter.checkPaymentStatus()`
- GoPay bisa dijangkau via Midtrans sebagai acquirer

## Xendit

- dideteksi dari merchant account identifier yang mengandung `xendit`
- mendukung local QRIS transformation untuk payload yang sudah ada
- API adapter tersedia: `xenditAdapter.createDynamicQr()` dan `xenditAdapter.checkPaymentStatus()`
- satu integrasi mendukung semua e-wallet dan mobile banking yang terhubung ke QRIS

## Duitku

- dideteksi dari merchant account identifier yang mengandung `duitku`
- mendukung local QRIS transformation untuk payload yang sudah ada
- API adapter tersedia: `duitkuAdapter.createDynamicQr()` dan `duitkuAdapter.checkPaymentStatus()`
- signature menggunakan MD5: `merchantCode + amount + orderId + merchantKey`

## Detection strategy

Deteksi provider dilakukan dengan membaca subtag `00` pada merchant account information (`26`-`51`) lalu mencocokkannya dengan identifier yang dikenal.
