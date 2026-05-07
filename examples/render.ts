/**
 * render.ts — QR rendering examples
 *
 * Demonstrates: renderQrToDataUrl, renderQrToFile
 *
 * Run:
 *   bun run examples/render.ts
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeDynamic, renderQrToDataUrl, renderQrToFile } from "../src/index";

const STATIC_QRIS =
  "00020101021126610016ID.CO.SHOPEE.WWW01189360091800230223530208230223530303UMI51440014ID.CO.QRIS.WWW0215ID10265163524850303UMI5204581753033605802ID5913Chick n booth6010PEKALONGAN61055118262070703A016304B9ED";

async function main() {
  // ── 1. Render to data URL (for web display) ──────────────────────

  console.log("=== 1. Render to data URL ===\n");

  const dynamic = makeDynamic(STATIC_QRIS, { amount: 50000 });

  const dataUrl = await renderQrToDataUrl(dynamic.qrisString);
  console.log("Data URL (first 100 chars):", dataUrl.slice(0, 100) + "...");
  console.log("Can be used directly in <img src=\"...\"> or CSS background-image\n");

  // With custom options
  const largeQr = await renderQrToDataUrl(dynamic.qrisString, {
    width: 512,
    margin: 4,
  });
  console.log("Large QR data URL length:", largeQr.length, "chars\n");

  // ── 2. Render to file ────────────────────────────────────────────

  console.log("=== 2. Render to file ===\n");

  const outDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
  const outPath = join(outDir, "qris-output.png");

  await renderQrToFile(dynamic.qrisString, outPath, { width: 400, margin: 3 });
  console.log("Saved to:", outPath);

  // Small size for inline/embedded use
  const smallPath = join(outDir, "qris-small.png");
  await renderQrToFile(dynamic.qrisString, smallPath, { width: 128, margin: 1 });
  console.log("Small QR saved to:", smallPath);
  console.log();

  // ── 3. Full flow: static → dynamic → render ──────────────────────

  console.log("=== 3. Full flow ===\n");

  const result = makeDynamic(STATIC_QRIS, {
    amount: 125000,
    merchantRef: "INV-2024-042",
    terminalLabel: "KASIR-03",
  });

  console.log("Provider:", result.provider);
  console.log("Source:", result.source);
  console.log("Amount:", result.amount);

  const dataUrlFull = await renderQrToDataUrl(result.qrisString, { width: 320 });
  console.log("QR data URL ready, length:", dataUrlFull.length);
  console.log();
}

main().catch(console.error);
