import { describe, expect, test } from "bun:test";
import { parse } from "../../src/core/parser";
import { validate } from "../../src/core/validator";
import { staticToDynamic } from "../../src/transform/static-to-dynamic";
import { genericStaticQris } from "../fixtures/qris";

describe("staticToDynamic", () => {
  test("converts static QRIS into dynamic QRIS", () => {
    const result = staticToDynamic(genericStaticQris, {
      amount: 12500,
      merchantRef: "INV-001",
      terminalLabel: "POS-A",
    });

    const parsed = parse(result);
    expect(parsed.nodes.find((node) => node.id === "01")?.value).toBe("12");
    expect(parsed.nodes.find((node) => node.id === "54")?.value).toBe("12500.00");
    expect(parsed.nodes.find((node) => node.id === "62")?.children?.find((node) => node.id === "05")?.value).toBe("INV-001");
    expect(parsed.nodes.find((node) => node.id === "62")?.children?.find((node) => node.id === "07")?.value).toBe("POS-A");
    expect(validate(result).valid).toBe(true);
  });

  test("converts without optional fields", () => {
    const result = staticToDynamic(genericStaticQris, { amount: 50000 });
    const parsed = parse(result);
    expect(parsed.nodes.find((n) => n.id === "01")?.value).toBe("12");
    expect(parsed.nodes.find((n) => n.id === "54")?.value).toBe("50000.00");
    expect(parsed.nodes.find((n) => n.id === "62")).toBeUndefined();
    expect(validate(result).valid).toBe(true);
  });

  test("applies fixed tip (tipType: fixed)", () => {
    const result = staticToDynamic(genericStaticQris, {
      amount: 100000,
      tipType: "fixed",
      tipValue: 2000,
    });
    const parsed = parse(result);
    expect(parsed.nodes.find((n) => n.id === "55")?.value).toBe("02");
    expect(parsed.nodes.find((n) => n.id === "56")?.value).toBe("2000.00");
    expect(validate(result).valid).toBe(true);
  });

  test("applies percent tip (tipType: percent)", () => {
    const result = staticToDynamic(genericStaticQris, {
      amount: 100000,
      tipType: "percent",
      tipValue: 5,
    });
    const parsed = parse(result);
    expect(parsed.nodes.find((n) => n.id === "55")?.value).toBe("03");
    expect(parsed.nodes.find((n) => n.id === "57")?.value).toBe("5");
    expect(validate(result).valid).toBe(true);
  });

  test("throws on invalid amount (zero)", () => {
    expect(() => staticToDynamic(genericStaticQris, { amount: 0 })).toThrow("Amount must be a positive number");
  });

  test("throws on invalid amount (negative)", () => {
    expect(() => staticToDynamic(genericStaticQris, { amount: -1000 })).toThrow("Amount must be a positive number");
  });

  test("throws when QRIS is already dynamic", () => {
    const dynamic = staticToDynamic(genericStaticQris, { amount: 10000 });
    expect(() => staticToDynamic(dynamic, { amount: 20000 })).toThrow("QRIS payload is already dynamic");
  });

  test("throws on fixed tip without tipValue", () => {
    expect(() =>
      staticToDynamic(genericStaticQris, { amount: 10000, tipType: "fixed" }),
    ).toThrow("Fixed tip requires a positive tipValue");
  });

  test("throws on percent tip without tipValue", () => {
    expect(() =>
      staticToDynamic(genericStaticQris, { amount: 10000, tipType: "percent" }),
    ).toThrow("Percent tip requires a positive tipValue");
  });
});
