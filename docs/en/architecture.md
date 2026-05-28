# Architecture

English | [Bahasa Indonesia](../architecture.md)

`qris-saurus` is divided into two main layers.

## 1. Core QRIS engine

This layer is provider-agnostic and is responsible for:

- reading QRIS payloads in TLV format
- validating required tags
- verifying the CRC
- transforming static QRIS into dynamic QRIS
- writing the payload back with a new CRC

Main components:

- `src/utils/tlv.ts`
- `src/core/crc.ts`
- `src/core/parser.ts`
- `src/core/serializer.ts`
- `src/core/validator.ts`
- `src/transform/static-to-dynamic.ts`
- `src/render.ts`

`src/render.ts` sits above the payload layer. It does not change the QRIS structure; it only turns a valid payload string into a QR image.

### Internal flow

The internal flow used by the library:

1. `parse(qrisString)`
   - splits the string into TLV nodes
2. `validate(qrisString)`
   - ensures the CRC and important tags remain consistent
3. `detectProvider(qrisString)`
   - reads merchant account info and tries to recognize a provider
4. `staticToDynamic(qrisString, options)`
   - changes the required tags for a dynamic transaction
5. `serialize(data)`
   - builds a new string and recalculates the CRC

### Why not manipulate the string directly?

Because QRIS payloads are sensitive to field positions, field lengths, and CRC values. Manual string edits can easily produce a payload that looks correct but fails in a scanner or gateway.

## 2. Provider layer

This layer is responsible for:

- detecting the provider from merchant account info
- storing provider metadata and caveats
- providing adapters for local transformation and gateway APIs

Main components:

- `src/providers/base.ts`
- `src/providers/registry.ts`
- `src/providers/*.ts`
- `src/providers/adapters/types.ts`
- `src/providers/adapters/midtrans.ts`
- `src/providers/adapters/xendit.ts`
- `src/providers/adapters/duitku.ts`

## Relationship to gateways

It is important to distinguish between:

- **local payload transformation**: works on an existing QRIS string, requires no internet, synchronous — via `staticToDynamic()` / `makeDynamic()`
- **gateway QR generation**: requests a new QR directly from Midtrans/Xendit/Duitku/DOKU, asynchronous — via `midtransAdapter`, `xenditAdapter`, `duitkuAdapter`, `dokuAdapter`

Both approaches are available and can be chosen based on your needs. See [docs/en/sdk/gateway.md](./sdk/gateway.md) for guidance on when to use each.

## Design principles

- always use the parse → validate → transform → serialize flow
- never manipulate the payload string manually
- separate local transformation from gateway API integration
- keep the public API small and easy to use
- use fixtures and tests to ensure CRC values and payload structures remain valid
