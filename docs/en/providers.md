# Provider Notes

English | [Indonesian](../providers.md)

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
- signature uses MD5: `merchantCode + amount + orderId + merchantKey`
  > ⚠️ **Security Warning**: MD5 is cryptographically broken and vulnerable to collision attacks. This is a limitation of the Duitku API. For internal or future integrations, use a stronger algorithm such as HMAC-SHA256. Always validate payloads server-side and monitor API updates for support of safer algorithms.

## Detection strategy

Provider detection is performed by reading subtag `00` from the merchant account information (`26`-`51`) and matching it against known identifiers.
