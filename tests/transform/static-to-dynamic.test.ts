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
    expect(validate(result).valid).toBe(true);
  });
});
