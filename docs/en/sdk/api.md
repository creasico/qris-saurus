# API Reference

English | [Bahasa Indonesia](../../sdk/api.md)

All exports come from the main entry point:

```ts
import { ... } from "qris-saurus";
```

---

## Main functions

### `validate(qrisString)`

Validates a QRIS payload by checking the CRC and required tags.

```ts
function validate(qrisString: string): ValidationResult
```

**Returns** `ValidationResult`:

```ts
interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

Required tags checked: `00`, `01`, `52`, `53`, `58`, `59`, `60`.

### `parse(qrisString)`

Parses a QRIS string into a TLV structure with built-in CRC verification.

```ts
function parse(qrisString: string): QrisData
```

**Returns** `QrisData`:

```ts
interface QrisData {
  raw: string;
  nodes: TlvNode[];
  crc: string;
}
```

Throws an `Error` if the CRC is invalid or the CRC tag cannot be found.

### `staticToDynamic(qrisString, options)`

Transforms static QRIS into dynamic QRIS locally. This is the core transformation function and does not require any API connection.

```ts
function staticToDynamic(qrisString: string, options: DynamicOptions): string
```

**`DynamicOptions`:**

```ts
interface DynamicOptions {
  amount: number;
  tipType?: "none" | "fixed" | "percent";
  tipValue?: number;
  merchantRef?: string;
  terminalLabel?: string;
}
```

Returns a new dynamic QRIS string with a recalculated CRC.

### `makeDynamic(qrisString, options)`

Like `staticToDynamic`, but with automatic provider detection and a richer return value.

```ts
function makeDynamic(qrisString: string, options: DynamicOptions): DynamicResult
```

**Returns** `DynamicResult`:

```ts
interface DynamicResult {
  qrisString: string;
  source: "local" | "api";
  provider: string;
  amount: number;
  raw?: unknown;
}
```

### `detectProvider(qrisString)`

Detects a provider from the QRIS payload based on merchant account identifiers.

```ts
function detectProvider(qrisString: string): ProviderAdapter | null
```

Returns `null` if no matching provider is found.

### `listProviders()`

Returns all registered providers.

```ts
function listProviders(): ProviderAdapter[]
```

### `renderQrToDataUrl(qrisString, options?)`

Converts a QRIS string to a PNG data URL (Base64), ready to use in an `<img>` tag.

```ts
async function renderQrToDataUrl(
  qrisString: string,
  options?: RenderQrOptions,
): Promise<string>
```

### `renderQrToFile(qrisString, outputPath, options?)`

Saves a QRIS payload as a PNG file.

```ts
async function renderQrToFile(
  qrisString: string,
  outputPath: string,
  options?: RenderQrOptions,
): Promise<void>
```

---

## Data types

### `TlvNode`

```ts
interface TlvNode {
  id: string;
  length: number;
  value: string;
  children?: TlvNode[];
}
```

### `QrisData`

```ts
interface QrisData {
  raw: string;
  nodes: TlvNode[];
  crc: string;
}
```

### `DynamicOptions`

```ts
interface DynamicOptions {
  amount: number;
  tipType?: "none" | "fixed" | "percent";
  tipValue?: number;
  merchantRef?: string;
  terminalLabel?: string;
}
```

### `DynamicResult`

```ts
interface DynamicResult {
  qrisString: string;
  source: "local" | "api";
  provider: string;
  amount: number;
  raw?: unknown;
}
```

### `ProviderInfo`

```ts
interface ProviderInfo {
  code: string;
  name: string;
  aliases: string[];
  merchantInfoTagIds: string[];
  identifiers: string[];
  supportsApiDynamic: boolean;
  notes?: string;
}
```

### `ValidationResult`

```ts
interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

---

## `ProviderAdapter` class

Each provider is represented by a `ProviderAdapter` instance.

```ts
class ProviderAdapter {
  readonly info: ProviderInfo;
  matches(nodes: TlvNode[]): boolean;
  toDynamic(qrisString: string, options: DynamicOptions): DynamicResult;
}
```

Use `detectProvider()` or `listProviders()` instead of instantiating it manually.

---

## CRC functions

```ts
function computeCrc(input: string): string;
function verifyCrc(qrisString: string): boolean;
```

These are usually handled internally by `parse()` and `serialize()`.

## `serialize` function

```ts
function serialize(data: QrisData): string;
```

Converts `QrisData` back to a QRIS string with a recalculated CRC.
