import { describe, expect, test } from "bun:test";
import { computeCrc } from "../../src/core/crc";
import { validate } from "../../src/core/validator";
import { genericStaticQris } from "../fixtures/qris";

function tag(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, "0")}${value}`;
}

function withCrc(body: string): string {
  return `${body}6304${computeCrc(`${body}6304`)}`;
}

describe("validator", () => {
  test("accepts valid QRIS fixture", () => {
    expect(validate(genericStaticQris)).toEqual({ valid: true, errors: [] });
  });

  test("rejects invalid CRC", () => {
    const invalid = `${genericStaticQris.slice(0, -1)}0`;
    expect(validate(invalid).valid).toBe(false);
    expect(validate(invalid).errors).toContain("Invalid CRC value");
  });

  test("rejects payload with missing CRC tag", () => {
    const noCrc = "00020101021126160010ID.SHOPEE01";
    const result = validate(noCrc);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing CRC tag 63");
  });

  test("rejects payload missing required tag", () => {
    // Build valid payload but omit tag 59 (merchant name)
    const body = [
      tag("00", "01"),
      tag("01", "11"),
      tag("52", "5812"),
      tag("53", "360"),
      tag("58", "ID"),
      tag("60", "JAKARTA"),
    ].join("");
    const result = validate(withCrc(body));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Missing required tag 59");
  });

  test("rejects payload with invalid initiation method (tag 01)", () => {
    const body = [
      tag("00", "01"),
      tag("01", "99"),
      tag("52", "5812"),
      tag("53", "360"),
      tag("58", "ID"),
      tag("59", "TOKO"),
      tag("60", "KOTA"),
    ].join("");
    const result = validate(withCrc(body));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Tag 01 must be 11 or 12");
  });

  test("rejects payload with non-IDR currency (tag 53)", () => {
    const body = [
      tag("00", "01"),
      tag("01", "11"),
      tag("52", "5812"),
      tag("53", "840"), // USD
      tag("58", "ID"),
      tag("59", "TOKO"),
      tag("60", "KOTA"),
    ].join("");
    const result = validate(withCrc(body));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Tag 53 must be 360 for IDR");
  });
});
