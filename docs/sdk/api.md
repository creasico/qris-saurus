# Referensi API

[English](../en/sdk/api.md) | Bahasa Indonesia

Semua export berasal dari entry point utama:

```ts
import { ... } from "qris-saurus";
```

---

## Fungsi utama

### `validate(qrisString)`

Memvalidasi payload QRIS: memeriksa CRC dan tag-tag wajib.

```ts
function validate(qrisString: string): ValidationResult
```

**Returns** `ValidationResult`:

```ts
interface ValidationResult {
  valid: boolean;
  errors: string[]; // kosong jika valid
}
```

Tag wajib yang dicek: `00`, `01`, `52`, `53`, `58`, `59`, `60`.

**Contoh:**

```ts
const result = validate(qrisString);
if (!result.valid) {
  console.error(result.errors);
}
```

---

### `parse(qrisString)`

Mem-parse string QRIS menjadi struktur TLV dengan verifikasi CRC bawaan.

```ts
function parse(qrisString: string): QrisData
```

**Returns** `QrisData`:

```ts
interface QrisData {
  raw: string;       // string QRIS asli
  nodes: TlvNode[];  // hasil parse TLV
  crc: string;       // nilai CRC (4 karakter hex)
}
```

Akan melempar `Error` jika CRC tidak valid atau tag CRC tidak ditemukan.

**Contoh:**

```ts
const data = parse(qrisString);
const merchantName = data.nodes.find(n => n.id === "59")?.value;
```

---

### `staticToDynamic(qrisString, options)`

Mengubah QRIS statis menjadi dinamis secara lokal. Ini adalah fungsi transformasi inti — tidak memerlukan koneksi ke API manapun.

```ts
function staticToDynamic(qrisString: string, options: DynamicOptions): string
```

**`DynamicOptions`:**

```ts
interface DynamicOptions {
  amount: number;                          // nominal transaksi (wajib, > 0)
  tipType?: "none" | "fixed" | "percent";  // tipe biaya layanan
  tipValue?: number;                       // nilai tip (jika tipType bukan "none")
  merchantRef?: string;                    // referensi merchant (tag 62-05)
  terminalLabel?: string;                  // label terminal (tag 62-07)
}
```

**Returns** string QRIS dinamis baru dengan CRC yang sudah dihitung ulang.

Akan melempar `Error` jika:
- `amount` bukan bilangan positif
- payload sudah dinamis (tag `01` = `12`)
- tip konfigurasi tidak valid

**Contoh:**

```ts
// Minimum
const dynamic = staticToDynamic(qrisString, { amount: 25_000 });

// Dengan referensi dan tip
const dynamic = staticToDynamic(qrisString, {
  amount: 100_000,
  merchantRef: "INV-2026-042",
  terminalLabel: "POS-B",
  tipType: "fixed",
  tipValue: 2_000,
});

// Dengan tip persen
const dynamic = staticToDynamic(qrisString, {
  amount: 100_000,
  tipType: "percent",
  tipValue: 5, // 5%
});
```

---

### `makeDynamic(qrisString, options)`

Seperti `staticToDynamic`, tapi dengan deteksi provider otomatis dan hasil yang lebih kaya.

```ts
function makeDynamic(qrisString: string, options: DynamicOptions): DynamicResult
```

**Returns** `DynamicResult`:

```ts
interface DynamicResult {
  qrisString: string;              // payload QRIS dinamis
  source: "local" | "api";        // selalu "local" untuk saat ini
  provider: string;                // kode provider atau "generic"
  amount: number;                  // nominal yang diinject
  raw?: unknown;                   // reserved untuk respons API gateway
}
```

**Contoh:**

```ts
const result = makeDynamic(qrisString, { amount: 75_000 });
console.log(result.provider); // "gopay" / "shopeepay" / "generic"
```

---

### `detectProvider(qrisString)`

Mencari tahu provider dari payload QRIS berdasarkan merchant account identifier.

```ts
function detectProvider(qrisString: string): ProviderAdapter | null
```

Mengembalikan `null` jika tidak ada provider yang cocok.

**Contoh:**

```ts
const adapter = detectProvider(qrisString);
if (adapter) {
  console.log(adapter.info.name);               // "GoPay"
  console.log(adapter.info.supportsApiDynamic); // true/false
}
```

---

### `listProviders()`

Mengembalikan semua provider yang terdaftar.

```ts
function listProviders(): ProviderAdapter[]
```

**Contoh:**

```ts
for (const p of listProviders()) {
  console.log(p.info.code, p.info.supportsApiDynamic);
}
```

---

### `renderQrToDataUrl(qrisString, options?)`

Mengubah string QRIS menjadi data URL PNG (Base64), siap dipakai di tag `<img>`.

```ts
async function renderQrToDataUrl(
  qrisString: string,
  options?: RenderQrOptions,
): Promise<string>
```

**`RenderQrOptions`:**

```ts
interface RenderQrOptions {
  width?: number;   // default 320 (piksel)
  margin?: number;  // default 2 (modul)
}
```

**Contoh:**

```ts
// Jika menggunakan staticToDynamic, yang mengembalikan string langsung:
const qrisString = staticToDynamic(staticQris, { amount: 100000 });
const dataUrl = await renderQrToDataUrl(qrisString, { width: 400 });
// <img src={dataUrl} />

// Atau jika menggunakan makeDynamic, yang mengembalikan object dengan .qrisString:
const result = makeDynamic(staticQris, { amount: 100000 });
const dataUrl = await renderQrToDataUrl(result.qrisString, { width: 400 });
```

---

### `renderQrToFile(qrisString, outputPath, options?)`

Menyimpan QRIS sebagai file PNG.

```ts
async function renderQrToFile(
  qrisString: string,
  outputPath: string,
  options?: RenderQrOptions,
): Promise<void>
```

**Contoh:**

```ts
await renderQrToFile(dynamic.qrisString, "./invoice-qr.png", { width: 512 });
```

---

## Tipe data

### `TlvNode`

Node TLV hasil parse. Node-node ini membentuk struktur pohon — node tertentu (seperti tag `26`–`51` merchant account info) memiliki `children`.

```ts
interface TlvNode {
  id: string;           // tag identifier, 2 karakter
  length: number;       // panjang nilai
  value: string;        // isi node
  children?: TlvNode[]; // subtag (nested TLV)
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
  code: string;                // "gopay", "shopeepay", dll
  name: string;                // "GoPay", "ShopeePay", dll
  aliases: string[];
  merchantInfoTagIds: string[];
  identifiers: string[];       // substring yang dicek di subtag 00
  supportsApiDynamic: boolean; // apakah punya API gateway khusus
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

## Class `ProviderAdapter`

Setiap provider direpresentasikan oleh instance `ProviderAdapter`.

```ts
class ProviderAdapter {
  readonly info: ProviderInfo;

  // Cek apakah nodes cocok dengan provider ini
  matches(nodes: TlvNode[]): boolean;

  // Buat QRIS dinamis via local transform
  toDynamic(qrisString: string, options: DynamicOptions): DynamicResult;
}
```

Kamu tidak perlu menginstansiasi class ini secara manual — gunakan `detectProvider()` atau `listProviders()`.

---

## Fungsi CRC (advanced)

```ts
// Hitung CRC dari string, return 4 karakter hex uppercase
function computeCrc(input: string): string;

// Verifikasi CRC dalam payload QRIS
function verifyCrc(qrisString: string): boolean;
```

Biasanya tidak perlu dipanggil langsung — `parse()` dan `serialize()` mengurusnya secara internal.

---

## Fungsi `serialize` (advanced)

```ts
function serialize(data: QrisData): string;
```

Mengubah `QrisData` kembali menjadi string QRIS dengan CRC yang dihitung ulang. Dipakai internal oleh `staticToDynamic`. Tersedia jika kamu ingin memodifikasi node secara manual sebelum serialize.

**Contoh:**

```ts
import { parse, serialize } from "qris-saurus";

const data = parse(qrisString);
// modifikasi data.nodes secara manual...
const newQrisString = serialize(data);
```
