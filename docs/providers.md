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
- API adapter tersedia: `xenditAdapter.createDynamicQr()`, `xenditAdapter.checkPaymentStatus()`, dan helper multi-method gateway
- VA direct mendukung BCA, BNI, BRI, Mandiri, dan Permata lewat Callback Virtual Account API; CIMB tetap guarded karena tidak ada mapping channel direct yang aman di adapter ini
- e-wallet direct mendukung OVO, DANA, LinkAja, dan ShopeePay lewat E-Wallet Charges API dengan channel `ID_OVO`, `ID_DANA`, `ID_LINKAJA`, dan `ID_SHOPEEPAY`
- hosted invoice tetap tersedia lewat `gateway.createCheckout()` / `gateway.createHostedCheckout()`

## Duitku

- dideteksi dari merchant account identifier yang mengandung `duitku`
- mendukung transformasi QRIS lokal untuk payload yang sudah ada
- API adapter tersedia: `duitkuAdapter.createDynamicQr()`, `duitkuAdapter.checkPaymentStatus()`, dan helper multi-method gateway
- Direct API `/v2/inquiry` memakai HMAC-SHA256: `merchantCode + merchantOrderId + paymentAmount` untuk QRIS, VA, dan e-wallet
- VA direct mendukung BCA (`BC`), BNI (`I1`), BRI (`BR`), Mandiri (`M2`), Permata (`BT`), dan CIMB (`B1`)
- e-wallet direct mendukung OVO (`OV`), ShopeePay (`SA`), DANA (`DA`), dan LinkAja (`LF`)
- webhook divalidasi dengan HMAC-SHA256 dari `merchantCode + amount + merchantOrderId` dan dicek terhadap `merchantCode` config

## DOKU

- API adapter tersedia: `dokuAdapter.createDynamicQr()`, `dokuAdapter.checkPaymentStatus()`, dan helper multi-method gateway
- memakai SNAP QRIS MPM Generate/Query dengan access token B2B RSA-SHA256
- VA direct mendukung BCA, BNI, BRI, Mandiri, Permata, dan CIMB; `virtualAccountPartnerServiceId` wajib untuk nomor VA merchant
- e-wallet direct mendukung DANA dan ShopeePay; OVO tetap guarded karena butuh binding/tokenization terpisah
- request dan webhook SNAP ditandatangani HMAC-SHA512
- webhook sebaiknya diverifikasi dengan `rawBody`, `webhookPath`, dan batas timestamp default 5 menit

## Strategi deteksi

Deteksi provider dilakukan dengan membaca subtag `00` pada merchant account information (`26`-`51`) lalu mencocokkannya dengan identifier yang dikenal.
