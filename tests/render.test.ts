import { describe, expect, test } from "bun:test";
import { renderQrToDataUrl } from "../src/render";
import { genericStaticQris } from "./fixtures/qris";

describe("render", () => {
  test("renders QRIS payload to data URL", async () => {
    const dataUrl = await renderQrToDataUrl(genericStaticQris);
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});
