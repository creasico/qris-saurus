import { computeCrc } from "./crc";
import type { QrisData, TlvNode } from "./types";
import { writeTlv } from "../utils/tlv";

function stripCrc(nodes: TlvNode[]): TlvNode[] {
  return nodes.filter((node) => node.id !== "63");
}

export function serialize(data: Pick<QrisData, "nodes">): string {
  const body = writeTlv(stripCrc(data.nodes));
  const payload = `${body}6304`;
  const crc = computeCrc(payload);
  return `${payload}${crc}`;
}
