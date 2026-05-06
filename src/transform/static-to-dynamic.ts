import { parse } from "../core/parser";
import { serialize } from "../core/serializer";
import type { DynamicOptions, QrisData, TlvNode } from "../core/types";
import { deleteNode, findNode, upsertNode } from "../utils/tlv";

function formatAmount(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Amount must be a positive number");
  }

  return amount.toFixed(2);
}

function withSubTag(children: TlvNode[], id: string, value: string): TlvNode[] {
  // Use Buffer.byteLength to compute actual UTF-8 byte length, not string length
  const length = Buffer.byteLength(value, "utf8");
  const node: TlvNode = { id, length, value };
  return upsertNode(children, node);
}

function transformAdditionalData(existing?: TlvNode, options?: DynamicOptions): TlvNode | undefined {
  let children = existing?.children ?? [];

  if (options?.merchantRef) {
    children = withSubTag(children, "05", options.merchantRef);
  }

  if (options?.terminalLabel) {
    children = withSubTag(children, "07", options.terminalLabel);
  }

  if (children.length === 0) {
    return undefined;
  }

  const value = children.map((child) => `${child.id}${child.value.length.toString().padStart(2, "0")}${child.value}`).join("");
  return { id: "62", length: value.length, value, children };
}

function transformTips(nodes: TlvNode[], options: DynamicOptions): TlvNode[] {
  let nextNodes = deleteNode(deleteNode(deleteNode(nodes, "55"), "56"), "57");

  if (!options.tipType || options.tipType === "none") {
    return nextNodes;
  }

  if (options.tipType === "fixed") {
    if (typeof options.tipValue !== "number" || options.tipValue <= 0) {
      throw new Error("Fixed tip requires a positive tipValue");
    }

    nextNodes = upsertNode(nextNodes, { id: "55", length: 2, value: "02" });
    return upsertNode(nextNodes, { id: "56", length: formatAmount(options.tipValue).length, value: formatAmount(options.tipValue) });
  }

  if (typeof options.tipValue !== "number" || options.tipValue <= 0) {
    throw new Error("Percent tip requires a positive tipValue");
  }

  nextNodes = upsertNode(nextNodes, { id: "55", length: 2, value: "03" });
  return upsertNode(nextNodes, { id: "57", length: options.tipValue.toString().length, value: options.tipValue.toString() });
}

function replaceNode(nodes: TlvNode[], id: string, value: string): TlvNode[] {
  return upsertNode(nodes, { id, length: value.length, value });
}

export function staticToDynamic(qrisString: string, options: DynamicOptions): string {
  const parsed = parse(qrisString);
  const pointOfInitiation = findNode(parsed.nodes, "01")?.value;

  if (pointOfInitiation === "12") {
    throw new Error("QRIS payload is already dynamic");
  }

  // Only allow conversion of static QRIS (POI must be "11" or absent, which defaults to "11")
  if (pointOfInitiation !== undefined && pointOfInitiation !== "11") {
    throw new Error("QRIS payload is not static (Point of Initiation Method must be '11')");
  }

  let nodes = replaceNode(parsed.nodes, "01", "12");
  nodes = replaceNode(nodes, "54", formatAmount(options.amount));
  nodes = transformTips(nodes, options);

  const additionalData = transformAdditionalData(findNode(nodes, "62"), options);
  if (additionalData) {
    nodes = upsertNode(nodes, additionalData);
  }

  const normalized: QrisData = {
    ...parsed,
    nodes,
  };

  return serialize(normalized);
}
