import { describe, expect, test } from "bun:test";
import { validate } from "../../src/core/validator";
import { genericStaticQris } from "../fixtures/qris";

describe("validator", () => {
  test("accepts valid QRIS fixture", () => {
    expect(validate(genericStaticQris)).toEqual({ valid: true, errors: [] });
  });

  test("rejects invalid CRC", () => {
    const invalid = `${genericStaticQris.slice(0, -1)}0`;
    expect(validate(invalid).valid).toBe(false);
  });
});
