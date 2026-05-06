import { describe, expect, test } from "bun:test";
import { detectProvider, makeDynamic } from "../../src/providers/registry";
import { duitkuStaticQris, genericStaticQris, gopayStaticQris, midtransStaticQris, shopeepayStaticQris, xenditStaticQris } from "../fixtures/qris";

describe("provider registry", () => {
  test("detects known providers", () => {
    expect(detectProvider(shopeepayStaticQris)?.info.code).toBe("shopeepay");
    expect(detectProvider(gopayStaticQris)?.info.code).toBe("gopay");
    expect(detectProvider(midtransStaticQris)?.info.code).toBe("midtrans");
    expect(detectProvider(xenditStaticQris)?.info.code).toBe("xendit");
    expect(detectProvider(duitkuStaticQris)?.info.code).toBe("duitku");
  });

  test("falls back to generic transformation", () => {
    const result = makeDynamic(genericStaticQris, { amount: 50000 });
    expect(result.provider).toBe("generic");
    expect(result.source).toBe("local");
  });
});
