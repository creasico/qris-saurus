import { staticToDynamic } from "../transform/static-to-dynamic";
import type { DynamicOptions, DynamicResult, ProviderInfo, TlvNode } from "../core/types";

export class ProviderAdapter {
  constructor(public readonly info: ProviderInfo) {}

  matches(nodes: TlvNode[]): boolean {
    return nodes.some((node) => {
      if (!this.info.merchantInfoTagIds.includes(node.id) || !node.children) {
        return false;
      }

      const identifier = node.children.find((child) => child.id === "00")?.value?.toLowerCase();
      return typeof identifier === "string" && this.info.identifiers.some((candidate) => identifier.includes(candidate.toLowerCase()));
    });
  }

  toDynamic(qrisString: string, options: DynamicOptions): DynamicResult {
    return {
      qrisString: staticToDynamic(qrisString, options),
      source: "local",
      provider: this.info.code,
      amount: options.amount,
    };
  }
}
