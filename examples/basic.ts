/**
 * basic.ts — Core API examples
 *
 * Demonstrates: parse, validate, serialize, computeCrc, verifyCrc,
 *   detectProvider, listProviders, staticToDynamic, makeDynamic
 *
 * Run:
 *   bun run examples/basic.ts
 */

import {
  parse,
  serialize,
  validate,
  computeCrc,
  verifyCrc,
  detectProvider,
  listProviders,
  staticToDynamic,
  makeDynamic,
} from "../src/index";

// ── Sample QRIS payloads ─────────────────────────────────────────────

const STATIC_SHOPEEPAY =
  "00020101021126610016ID.CO.SHOPEE.WWW01189360091800230223530208230223530303UMI51440014ID.CO.QRIS.WWW0215ID10265163524850303UMI5204581753033605802ID5913Chick n booth6010PEKALONGAN61055118262070703A016304B9ED";

const STATIC_GENERIC =
  "00020101021126360014ID.CO.QRIS.WWW0114GENERICSTORE015204581253033605802ID5911QRIS SAURUS6007JAKARTA63041669";

// ── 1. Parse ─────────────────────────────────────────────────────────

console.log("=== 1. Parse ===\n");

const parsed = parse(STATIC_SHOPEEPAY);
console.log("Merchant name:", parsed.nodes.find((n) => n.id === "59")?.value);
console.log("City:", parsed.nodes.find((n) => n.id === "60")?.value);
console.log("CRC:", parsed.crc);
console.log("Tag 26 children:", parsed.nodes.find((n) => n.id === "26")?.children);
console.log();

// ── 2. Validate ──────────────────────────────────────────────────────

console.log("=== 2. Validate ===\n");

const valid = validate(STATIC_SHOPEEPAY);
console.log("ShopeePay payload valid:", valid);

const tampered = STATIC_SHOPEEPAY.slice(0, -4) + "0000";
const invalid = validate(tampered);
console.log("Tampered payload valid:", invalid);
console.log();

// ── 3. CRC ───────────────────────────────────────────────────────────

console.log("=== 3. CRC ===\n");

const payload = STATIC_GENERIC.slice(0, -4); // strip CRC value, keep "6304"
const crc = computeCrc(payload);
console.log("Computed CRC:", crc);
console.log("Matches original:", crc === STATIC_GENERIC.slice(-4).toUpperCase());
console.log("Verify original:", verifyCrc(STATIC_GENERIC));
console.log("Verify tampered:", verifyCrc(tampered));
console.log();

// ── 4. Detect Provider ───────────────────────────────────────────────

console.log("=== 4. Detect Provider ===\n");

const shopee = detectProvider(STATIC_SHOPEEPAY);
console.log("ShopeePay detected:", shopee?.info.code, "-", shopee?.info.name);
console.log("Supports API dynamic:", shopee?.info.supportsApiDynamic);

const generic = detectProvider(STATIC_GENERIC);
console.log("Generic detected:", generic); // null
console.log();

// ── 5. List Providers ────────────────────────────────────────────────

console.log("=== 5. List Providers ===\n");

const providers = listProviders();
for (const p of providers) {
  console.log(`- ${p.info.code}: ${p.info.name} (API dynamic: ${p.info.supportsApiDynamic})`);
}
console.log();

// ── 6. Static to Dynamic ─────────────────────────────────────────────

console.log("=== 6. Static to Dynamic ===\n");

const dynamic = staticToDynamic(STATIC_SHOPEEPAY, {
  amount: 75000,
  merchantRef: "ORD-2024-001",
  terminalLabel: "POS-01",
});
console.log("Dynamic payload:");
console.log(dynamic);
console.log();

// Verify the result is valid
const dynamicCheck = validate(dynamic);
console.log("Dynamic payload valid:", dynamicCheck);
console.log();

// ── 7. Make Dynamic (with provider detection) ────────────────────────

console.log("=== 7. Make Dynamic ===\n");

const result = makeDynamic(STATIC_SHOPEEPAY, {
  amount: 25000,
  merchantRef: "INV-001",
});
console.log("Source:", result.source);
console.log("Provider:", result.provider);
console.log("Amount:", result.amount);
console.log("QRIS string:", result.qrisString);
console.log();

// ── 8. Dynamic with Tips ─────────────────────────────────────────────

console.log("=== 8. Dynamic with Tips ===\n");

// Fixed tip
const withFixedTip = staticToDynamic(STATIC_GENERIC, {
  amount: 50000,
  tipType: "fixed",
  tipValue: 2000,
});
console.log("With fixed tip (Rp 2,000):");
console.log(withFixedTip);
console.log();

// Percent tip
const withPercentTip = staticToDynamic(STATIC_GENERIC, {
  amount: 50000,
  tipType: "percent",
  tipValue: 5,
});
console.log("With percent tip (5%):");
console.log(withPercentTip);
console.log();

// ── 9. Serialize ─────────────────────────────────────────────────────

console.log("=== 9. Serialize ===\n");

const qrisData = parse(STATIC_GENERIC);
const reserialized = serialize(qrisData);
console.log("Original:", STATIC_GENERIC);
console.log("Reserialized:", reserialized);
console.log("Match:", STATIC_GENERIC === reserialized);
console.log();

// ── 10. Error handling ───────────────────────────────────────────────

console.log("=== 10. Error handling ===\n");

// validate() never throws — returns { valid, errors }
const bad = validate("not-a-qris-payload");
console.log("validate() on garbage:", bad);

// parse() throws on invalid input
try {
  parse("invalid");
} catch (err) {
  console.log("parse() throws:", (err as Error).message);
}

// staticToDynamic() throws on already-dynamic QRIS
try {
  const alreadyDynamic = staticToDynamic(STATIC_GENERIC, { amount: 10000 });
  staticToDynamic(alreadyDynamic, { amount: 10000 });
} catch (err) {
  console.log("staticToDynamic() on dynamic:", (err as Error).message);
}

// staticToDynamic() throws on negative amount
try {
  staticToDynamic(STATIC_GENERIC, { amount: -500 });
} catch (err) {
  console.log("staticToDynamic() on negative amount:", (err as Error).message);
}
console.log();

console.log("Done!");
