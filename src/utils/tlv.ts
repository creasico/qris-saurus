import type { TlvNode } from "../core/types";

const COMPOSITE_TAGS = new Set(["26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51", "62", "64"]);

export function readTlv(input: string): TlvNode[] {
  const nodes: TlvNode[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    if (cursor + 4 > input.length) {
      throw new Error(`Invalid TLV structure at offset ${cursor}`);
    }

    const id = input.slice(cursor, cursor + 2);
    const lengthText = input.slice(cursor + 2, cursor + 4);

    if (!/^\d{2}$/.test(lengthText)) {
      throw new Error(`Invalid TLV length for tag ${id}: expected 2 ASCII digits, got "${lengthText}"`);
    }

    const length = Number.parseInt(lengthText, 10);

    const valueStart = cursor + 4;
    const valueEnd = valueStart + length;

    if (valueEnd > input.length) {
      throw new Error(`TLV length exceeds payload for tag ${id}`);
    }

    const value = input.slice(valueStart, valueEnd);
    let node: TlvNode = { id, length, value };

    if (COMPOSITE_TAGS.has(id)) {
      try {
        node = {
          ...node,
          children: readTlv(value),
        };
      } catch (err) {
        // Re-throw parse errors with context about which tag failed
        throw new Error(
          `Failed to parse composite tag ${id}: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    nodes.push(node);
    cursor = valueEnd;
  }

  return nodes;
}

export function writeTlv(nodes: TlvNode[]): string {
  return nodes
    .map((node) => {
      const value = node.children ? writeTlv(node.children) : node.value;
      const length = value.length;
      
      if (length > 99) {
        throw new Error(
          `TLV value for tag ${node.id} exceeds maximum length of 99 (got ${length})`,
        );
      }
      
      return `${node.id}${length.toString().padStart(2, "0")}${value}`;
    })
    .join("");
}

export function findNode(nodes: TlvNode[], id: string): TlvNode | undefined {
  return nodes.find((node) => node.id === id);
}

export function upsertNode(nodes: TlvNode[], nextNode: TlvNode): TlvNode[] {
  const index = nodes.findIndex((node) => node.id === nextNode.id);

  if (index === -1) {
    return [...nodes, nextNode].sort((left, right) => left.id.localeCompare(right.id));
  }

  return nodes.map((node, currentIndex) => (currentIndex === index ? nextNode : node));
}

export function deleteNode(nodes: TlvNode[], id: string): TlvNode[] {
  return nodes.filter((node) => node.id !== id);
}
