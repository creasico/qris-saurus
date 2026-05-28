# Provider Notes

English | [Bahasa Indonesia](../providers.md)

## ShopeePay

- detected from a merchant account identifier containing `shopee`
- supports local QRIS transformation for existing payloads
- there is currently no standalone API adapter (`createDynamicQr()` / `checkPaymentStatus()`) because public evidence for a dynamic QRIS API is still limited

## GoPay

- detected from a merchant account identifier containing `gopay`
- supports local QRIS transformation for existing payloads
- there is currently no standalone API adapter (`createDynamicQr()` / `checkPaymentStatus()`) because QRIS API flows can vary depending on the aggregator or gateway

## Midtrans

- detected from a merchant account identifier containing `midtrans`
- supports local QRIS transformation for existing payloads
- API adapter available: `midtransAdapter.createDynamicQr()` and `midtransAdapter.checkPaymentStatus()`
- GoPay can be reached through Midtrans as the acquirer

## Xendit

- detected from a merchant account identifier containing `xendit`
- supports local QRIS transformation for existing payloads
- API adapter available: `xenditAdapter.createDynamicQr()` and `xenditAdapter.checkPaymentStatus()`
- one integration covers all e-wallets and mobile banking connected to QRIS

## Duitku

- detected from a merchant account identifier containing `duitku`
- supports local QRIS transformation for existing payloads
- API adapter available: `duitkuAdapter.createDynamicQr()` and `duitkuAdapter.checkPaymentStatus()`
- Direct API uses HMAC-SHA256: `merchantCode + merchantOrderId + paymentAmount` for inquiry and `merchantCode + merchantOrderId` for status
- webhooks are validated with HMAC-SHA256 over `merchantCode + amount + merchantOrderId` and checked against the configured `merchantCode`

## DOKU

- API adapter available: `dokuAdapter.createDynamicQr()` and `dokuAdapter.checkPaymentStatus()`
- uses SNAP QRIS MPM Generate/Query with RSA-SHA256 B2B access tokens
- SNAP requests and webhooks are signed with HMAC-SHA512
- webhooks should be verified with `rawBody`, `webhookPath`, and the default 5-minute timestamp window

## Detection strategy

Provider detection is performed by reading subtag `00` from the merchant account information (`26`-`51`) and matching it against known identifiers.
