import type { TlvNode } from "../core/types";

export function normalizeNodes(nodes: TlvNode[]): TlvNode[] {
  return nodes.map((node) => {
    if (!node.children) {
      return { ...node };
    }

    return {
      ...node,
      children: normalizeNodes(node.children),
    };
  });
}
