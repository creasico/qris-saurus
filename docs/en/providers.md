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
- API adapter available: `xenditAdapter.createDynamicQr()`, `xenditAdapter.checkPaymentStatus()`, and multi-method gateway helpers
- direct VA supports BCA, BNI, BRI, Mandiri, and Permata through the Callback Virtual Account API; CIMB remains guarded because this adapter has no safe direct channel mapping for it
- direct e-wallet supports OVO, DANA, LinkAja, and ShopeePay through the E-Wallet Charges API with `ID_OVO`, `ID_DANA`, `ID_LINKAJA`, and `ID_SHOPEEPAY`
- hosted invoices remain available through `gateway.createCheckout()` / `gateway.createHostedCheckout()`

## Duitku

- detected from a merchant account identifier containing `duitku`
- supports local QRIS transformation for existing payloads
- API adapter available: `duitkuAdapter.createDynamicQr()`, `duitkuAdapter.checkPaymentStatus()`, and multi-method gateway helpers
- Direct API `/v2/inquiry` uses HMAC-SHA256 over `merchantCode + merchantOrderId + paymentAmount` for QRIS, VA, and e-wallet
- direct VA supports BCA (`BC`), BNI (`I1`), BRI (`BR`), Mandiri (`M2`), Permata (`BT`), and CIMB (`B1`)
- direct e-wallet supports OVO (`OV`), ShopeePay (`SA`), DANA (`DA`), and LinkAja (`LF`)
- webhooks are validated with HMAC-SHA256 over `merchantCode + amount + merchantOrderId` and checked against the configured `merchantCode`

## DOKU

- API adapter available: `dokuAdapter.createDynamicQr()`, `dokuAdapter.checkPaymentStatus()`, and multi-method gateway helpers
- uses SNAP QRIS MPM Generate/Query with RSA-SHA256 B2B access tokens
- direct VA supports BCA, BNI, BRI, Mandiri, Permata, and CIMB; `virtualAccountPartnerServiceId` is required for merchant VA numbers
- direct e-wallet supports DANA and ShopeePay; OVO remains guarded because it requires separate binding/tokenization
- SNAP requests and webhooks are signed with HMAC-SHA512
- webhooks should be verified with `rawBody`, `webhookPath`, and the default 5-minute timestamp window

## Detection strategy

Provider detection is performed by reading subtag `00` from the merchant account information (`26`-`51`) and matching it against known identifiers.
