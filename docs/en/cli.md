# CLI Usage

English | [Indonesian](../cli.md)

`qris-saurus` provides a simple CLI for inspecting and transforming QRIS payloads.

## Build

```bash
bun run build
```

After building, the CLI file is available at `dist/cli.js`.

## Input modes

The CLI accepts QRIS payloads from three sources:

1. direct argument
2. `--input-file <file>`
3. stdin / pipe

The priority is direct argument first, then file, then stdin.

## Commands

### Validate

```bash
bun run dist/cli.js validate "<QRIS_PAYLOAD>"
```

```bash
bun run dist/cli.js validate --input-file ./payload.txt
```

```bash
cat ./payload.txt | bun run dist/cli.js validate
```

The output is JSON:

```json
{
  "valid": true,
  "errors": []
}
```

### Parse

```bash
bun run dist/cli.js parse "<QRIS_PAYLOAD>"
```

```bash
cat ./payload.txt | bun run dist/cli.js parse
```

The output is the parsed TLV structure.

### Detect provider

```bash
bun run dist/cli.js detect "<QRIS_PAYLOAD>"
```

```bash
bun run dist/cli.js detect --input-file ./payload.txt
```

If the provider is recognized, the output contains provider metadata.

### Convert to dynamic

```bash
bun run dist/cli.js dynamic "<QRIS_PAYLOAD>" --amount 12500 --merchant-ref INV-001 --terminal-label POS-A
```

```bash
cat ./payload.txt | bun run dist/cli.js dynamic --amount 12500 --merchant-ref INV-001
```

The output is a new QRIS payload that:
- uses the dynamic point of initiation method
- carries the transaction amount
- carries additional data when provided
- has a newly calculated valid CRC

### Render PNG

```bash
bun run dist/cli.js render "<QRIS_PAYLOAD>" --output ./qris.png --width 320 --margin 2
```

```bash
cat ./payload.txt | bun run dist/cli.js render --output ./qris.png
```

The output of this command is the generated PNG file path.

## Example workflow

1. get a static QRIS payload
2. run `validate`
3. run `detect`
4. run `dynamic`
5. take the resulting payload and render it to an image, or render the payload directly with `render`
6. use the PNG file in your UI, POS, invoice, or internal system
