import { describe, expect, test } from "bun:test";
import { computeCrc, verifyCrc } from "../../src/core/crc";
import { genericStaticQris } from "../fixtures/qris";

describe("crc", () => {
  test("computes deterministic CRC", () => {
    expect(computeCrc("0002010102116304")).toBe("AD0A");
  });

  test("verifies fixture CRC", () => {
    expect(verifyCrc(genericStaticQris)).toBe(true);
  });
});
