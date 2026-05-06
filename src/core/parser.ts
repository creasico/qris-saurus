import { verifyCrc } from "./crc";
import type { QrisData } from "./types";
import { readTlv } from "../utils/tlv";

export function parse(qrisString: string): QrisData {
  const markerIndex = qrisString.lastIndexOf("6304");

  if (markerIndex === -1 || qrisString.length < markerIndex + 8) {
    throw new Error("QRIS payload is missing CRC tag");
  }

  if (!verifyCrc(qrisString)) {
    throw new Error("QRIS payload has invalid CRC");
  }

  const crc = qrisString.slice(markerIndex + 4, markerIndex + 8).toUpperCase();
  const body = qrisString.slice(0, markerIndex);
  const nodes = readTlv(body);

  return {
    raw: qrisString,
    nodes,
    crc,
  };
}
