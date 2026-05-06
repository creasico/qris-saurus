import { verifyCrc } from "./crc";
import type { ValidationResult } from "./types";
import { readTlv } from "../utils/tlv";

const REQUIRED_ROOT_TAGS = ["00", "01", "52", "53", "58", "59", "60"];

export function validate(qrisString: string): ValidationResult {
  const errors: string[] = [];

  const markerIndex = qrisString.lastIndexOf("6304");
  if (markerIndex === -1 || qrisString.length < markerIndex + 8) {
    errors.push("Missing CRC tag 63");
    return { valid: false, errors };
  }

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
    if (initiationPoint && initiationPoint !== "11" && initiationPoint !== "12") {
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
