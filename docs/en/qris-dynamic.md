# QRIS Dynamic Notes

English | [Indonesian](../qris-dynamic.md)

## TLV structure

A QRIS payload uses the **Tag-Length-Value** format.

Example:

```text
5908TOKO ABC
```

Interpretation:
- `59` = merchant name
- `08` = data length
- `TOKO ABC` = field value

A complete QRIS string is a combination of many TLV fields read sequentially from left to right.

## Important tags in QRIS

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

## How QRIS works in practice

When a user scans QRIS:

1. the payment app reads the TLV payload
2. the app recognizes merchant, currency, and transaction information
3. the payment system determines the processing route based on the merchant account information
4. the user confirms the payment
5. the transaction is processed by the issuer, acquirer, or gateway in the corresponding ecosystem

`qris-saurus` does not replace a payment gateway. This library helps ensure that the QRIS payload being created or modified remains consistent and valid.

## Static vs dynamic

### Static QRIS

Usually:
- point of initiation method = `11`
- reusable
- not tied to a specific transaction amount

### Dynamic QRIS

Usually:
- point of initiation method = `12`
- transaction amount is carried in tag `54`
- extra transaction data can be carried in tag `62`
- created for a single checkout or order

## How transformation works in this library

`staticToDynamic()` performs these steps:

1. parse the QRIS payload
2. validate the CRC
3. ensure the original payload is still static
4. change tag `01` from `11` to `12`
5. fill or update tag `54` with the transaction amount
6. fill tag `62` if `merchantRef` or `terminalLabel` is provided
7. rewrite the payload and recalculate the CRC in tag `63`

## When is local transform enough?

Local transform is suitable when:
- the merchant already has a static QRIS payload
- the main need is to attach a transaction amount
- the internal system only needs a new QR payload to display to the user

## When is a gateway API a better fit?

A gateway API is more suitable when:
- the provider requires the QR to be created on their server side
- you need expiry time, callbacks, payment status, or reconciliation from the gateway
- you need assurance that the QR is truly tied to the transaction in the gateway system

## Scope of this library

`qris-saurus` covers two approaches:

**Local transform** (no internet, sync):
- TLV parser
- validator and CRC verifier/generator
- static-to-dynamic transformation
- provider detection

**Gateway API adapters** (async, requires server keys):
- Midtrans: `midtransAdapter.createDynamicQr()` + `checkPaymentStatus()`
- Xendit: `xenditAdapter.createDynamicQr()` + `checkPaymentStatus()`
- Duitku: `duitkuAdapter.createDynamicQr()` + `checkPaymentStatus()`

See [docs/en/sdk/gateway.md](./sdk/gateway.md) for a complete guide on when to use local transform vs gateway APIs.
