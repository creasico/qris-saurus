import { readTlv } from "../utils/tlv";
import { verifyCrc } from "./crc";
import type { ValidationResult } from "./types";

// Note: tag "01" is optional and validated separately with a default
const REQUIRED_ROOT_TAGS = ["00", "52", "53", "58", "59", "60"];

export function validate(qrisString: string): ValidationResult {
  const errors: string[] = [];

  // CRC tag "6304" must be at the fixed suffix position (last 8 characters)
  // Format: ...6304XXXX (where XXXX is the 4-digit CRC value)
  if (qrisString.length < 8) {
    errors.push("QRIS payload too short");
    return { valid: false, errors };
  }

  const crcTagPosition = qrisString.slice(-8, -4);
  if (crcTagPosition !== "6304") {
    errors.push("Missing CRC tag 63");
    return { valid: false, errors };
  }

  const markerIndex = qrisString.length - 8;

  if (!verifyCrc(qrisString)) {
    errors.push("Invalid CRC value");
  }

  try {
    const nodes = readTlv(qrisString.slice(0, markerIndex));
    const tagSet = new Set(nodes.map((node) => node.id));

    for (const tag of REQUIRED_ROOT_TAGS) {
      if (!tagSet.has(tag)) {
        errors.push(`Missing required tag ${tag}`);
      }
    }

    const initiationPoint = nodes.find((node) => node.id === "01")?.value;
    // Tag "01" (Point of Initiation Method) is optional
    // If present, must be "11" (static) or "12" (dynamic)
    // If absent, default is "11" (static)
    if (initiationPoint !== undefined && initiationPoint !== "11" && initiationPoint !== "12") {
      errors.push("Tag 01 must be 11 or 12");
    }

    const currency = nodes.find((node) => node.id === "53")?.value;
    if (currency && currency !== "360") {
      errors.push("Tag 53 must be 360 for IDR");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Invalid TLV payload");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
