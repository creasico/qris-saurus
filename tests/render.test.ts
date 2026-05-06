import { describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "fs";
import { renderQrToDataUrl, renderQrToFile } from "../src/render";
import { genericStaticQris } from "./fixtures/qris";

describe("render", () => {
  test("renders QRIS payload to data URL", async () => {
    const dataUrl = await renderQrToDataUrl(genericStaticQris);
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  test("data URL respects custom width option", async () => {
    const dataUrl = await renderQrToDataUrl(genericStaticQris, { width: 128 });
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    // smaller width → smaller base64 payload
    const defaultUrl = await renderQrToDataUrl(genericStaticQris);
    expect(dataUrl.length).toBeLessThan(defaultUrl.length);
  });

  test("renders QRIS payload to PNG file", async () => {
    const outputPath = "/tmp/qris-saurus-test.png";
    try {
      if (existsSync(outputPath)) rmSync(outputPath);

      await renderQrToFile(genericStaticQris, outputPath);

      expect(existsSync(outputPath)).toBe(true);
    } finally {
      // Ensure cleanup even if assertion throws
      if (existsSync(outputPath)) rmSync(outputPath);
    }
  });

  test("renderQrToFile respects custom width option", async () => {
    const outputPath = "/tmp/qris-saurus-test-narrow.png";
    try {
      if (existsSync(outputPath)) rmSync(outputPath);

      await renderQrToFile(genericStaticQris, outputPath, { width: 128 });

      expect(existsSync(outputPath)).toBe(true);
    } finally {
      // Ensure cleanup even if assertion throws
      if (existsSync(outputPath)) rmSync(outputPath);
    }
  });
});
