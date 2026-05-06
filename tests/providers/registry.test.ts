import { describe, expect, test } from "bun:test";
import { parse } from "../../src/core/parser";
import { validate } from "../../src/core/validator";
import { detectProvider, listProviders, makeDynamic } from "../../src/providers/registry";
import {
  duitkuStaticQris,
  genericStaticQris,
  gopayStaticQris,
  midtransStaticQris,
  shopeepayStaticQris,
  xenditStaticQris,
} from "../fixtures/qris";

describe("provider registry", () => {
  test("detects known providers", () => {
    expect(detectProvider(shopeepayStaticQris)?.info.code).toBe("shopeepay");
    expect(detectProvider(gopayStaticQris)?.info.code).toBe("gopay");
    expect(detectProvider(midtransStaticQris)?.info.code).toBe("midtrans");
    expect(detectProvider(xenditStaticQris)?.info.code).toBe("xendit");
    expect(detectProvider(duitkuStaticQris)?.info.code).toBe("duitku");
  });

  test("returns null for unrecognised QRIS", () => {
    expect(detectProvider(genericStaticQris)).toBeNull();
  });

  test("listProviders returns all registered providers", () => {
    const providers = listProviders();
    const codes = providers.map((p) => p.info.code);
    expect(codes).toContain("shopeepay");
    expect(codes).toContain("gopay");
    expect(codes).toContain("midtrans");
    expect(codes).toContain("xendit");
    expect(codes).toContain("duitku");
    expect(providers.length).toBeGreaterThanOrEqual(5);
  });

  test("falls back to generic transformation", () => {
    const result = makeDynamic(genericStaticQris, { amount: 50000 });
    expect(result.provider).toBe("generic");
    expect(result.source).toBe("local");
    expect(result.amount).toBe(50000);
    expect(validate(result.qrisString).valid).toBe(true);
  });

  test("makeDynamic uses provider toDynamic when provider is detected", () => {
    const result = makeDynamic(shopeepayStaticQris, {
      amount: 75000,
      merchantRef: "INV-SP-001",
    });
    expect(result.provider).toBe("shopeepay");
    expect(result.source).toBe("local");
    expect(result.amount).toBe(75000);
    const parsed = parse(result.qrisString);
    expect(parsed.nodes.find((n) => n.id === "01")?.value).toBe("12");
    expect(parsed.nodes.find((n) => n.id === "54")?.value).toBe("75000.00");
    expect(validate(result.qrisString).valid).toBe(true);
  });

  test("makeDynamic works for each known provider", () => {
    const fixtures = [
      { qris: gopayStaticQris, code: "gopay" },
      { qris: midtransStaticQris, code: "midtrans" },
      { qris: xenditStaticQris, code: "xendit" },
      { qris: duitkuStaticQris, code: "duitku" },
    ];

    for (const { qris, code } of fixtures) {
      const result = makeDynamic(qris, { amount: 25000 });
      expect(result.provider).toBe(code);
      expect(result.source).toBe("local");
      expect(validate(result.qrisString).valid).toBe(true);
    }
  });

  test("detected provider info has expected shape", () => {
    const provider = detectProvider(shopeepayStaticQris)!;
    expect(provider.info.code).toBeTypeOf("string");
    expect(provider.info.name).toBeTypeOf("string");
    expect(Array.isArray(provider.info.aliases)).toBe(true);
    expect(Array.isArray(provider.info.identifiers)).toBe(true);
    expect(typeof provider.info.supportsApiDynamic).toBe("boolean");
  });
});
