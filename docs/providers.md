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

- ditandai sebagai kandidat kuat untuk integrasi API di fase berikutnya
- tetap mendukung local QRIS transformation untuk payload yang sudah ada

## Xendit

- ditandai sebagai kandidat kuat untuk integrasi API di fase berikutnya
- tetap mendukung local QRIS transformation untuk payload yang sudah ada

## Duitku

- ditandai sebagai kandidat kuat untuk integrasi API di fase berikutnya
- tetap mendukung local QRIS transformation untuk payload yang sudah ada

## Detection strategy

Deteksi provider dilakukan dengan membaca subtag `00` pada merchant account information (`26`-`51`) lalu mencocokkannya dengan identifier yang dikenal.
