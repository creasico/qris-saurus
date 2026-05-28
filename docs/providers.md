# Catatan provider

[English](./en/providers.md) | Bahasa Indonesia

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
- mendukung transformasi QRIS lokal untuk payload yang sudah ada
- API adapter tersedia: `duitkuAdapter.createDynamicQr()` dan `duitkuAdapter.checkPaymentStatus()`
- Direct API memakai HMAC-SHA256: `merchantCode + merchantOrderId + paymentAmount` untuk inquiry dan `merchantCode + merchantOrderId` untuk status
- webhook divalidasi dengan HMAC-SHA256 dari `merchantCode + amount + merchantOrderId` dan dicek terhadap `merchantCode` config

## DOKU

- API adapter tersedia: `dokuAdapter.createDynamicQr()` dan `dokuAdapter.checkPaymentStatus()`
- memakai SNAP QRIS MPM Generate/Query dengan access token B2B RSA-SHA256
- request dan webhook SNAP ditandatangani HMAC-SHA512
- webhook sebaiknya diverifikasi dengan `rawBody`, `webhookPath`, dan batas timestamp default 5 menit

## Strategi deteksi

Deteksi provider dilakukan dengan membaca subtag `00` pada merchant account information (`26`-`51`) lalu mencocokkannya dengan identifier yang dikenal.
