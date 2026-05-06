import { describe, expect, test } from "bun:test";
import { parse } from "../../src/core/parser";
import { genericStaticQris } from "../fixtures/qris";

describe("parser", () => {
  test("parses root tags and CRC", () => {
    const parsed = parse(genericStaticQris);
    expect(parsed.nodes.find((node) => node.id === "01")?.value).toBe("11");
    expect(parsed.nodes.find((node) => node.id === "59")?.value).toBe("QRIS SAURUS");
    expect(parsed.crc).toHaveLength(4);
  });
});
