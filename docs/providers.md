# Provider Notes

[English](./en/providers.md) | Indonesian

## ShopeePay

- dideteksi dari merchant account identifier yang mengandung `shopee`
- mendukung local QRIS transformation untuk payload yang sudah ada
- untuk saat ini tidak ada adapter API standalone (`createDynamicQr()` / `checkPaymentStatus()`) karena bukti publik untuk dynamic QRIS API belum tersedia

## GoPay

- dideteksi dari merchant account identifier yang mengandung `gopay`
- mendukung local QRIS transformation untuk payload yang sudah ada
- untuk saat ini tidak ada adapter API standalone (`createDynamicQr()` / `checkPaymentStatus()`) karena flow API QRIS bisa berbeda tergantung aggregator atau gateway

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
  > ⚠️ **Security Warning**: MD5 adalah algoritma hash yang sudah cryptographically broken dan rentan terhadap collision attacks. Ini adalah keterbatasan API Duitku. Untuk integrasi internal atau di masa depan, gunakan algoritma yang lebih kuat seperti HMAC-SHA256. Selalu validasi payload di server-side dan monitor updates API untuk support algoritma yang lebih aman.

## Detection strategy

Deteksi provider dilakukan dengan membaca subtag `00` pada merchant account information (`26`-`51`) lalu mencocokkannya dengan identifier yang dikenal.
