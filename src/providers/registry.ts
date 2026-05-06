import { parse } from "../core/parser";
import type { DynamicOptions, DynamicResult } from "../core/types";
import { staticToDynamic } from "../transform/static-to-dynamic";
import { ProviderAdapter } from "./base";
import { duitkuProvider } from "./duitku";
import { gopayProvider } from "./gopay";
import { midtransProvider } from "./midtrans";
import { shopeepayProvider } from "./shopeepay";
import { xenditProvider } from "./xendit";

const providers: ProviderAdapter[] = [
  shopeepayProvider,
  gopayProvider,
  midtransProvider,
  xenditProvider,
  duitkuProvider,
];

export function listProviders(): ReadonlyArray<ProviderAdapter> {
  return [...providers];
}

export function detectProvider(qrisString: string): ProviderAdapter | null {
  const parsed = parse(qrisString); // Let parse errors propagate
  return providers.find((provider) => provider.matches(parsed.nodes)) ?? null;
}

export function makeDynamic(qrisString: string, options: DynamicOptions): DynamicResult {
  // Parse first to validate QRIS format — this will throw if invalid
  try {
    parse(qrisString);
  } catch (err) {
    throw new Error(
      `Failed to parse QRIS payload: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  // Now detect provider
  const provider = detectProvider(qrisString);

  if (!provider) {
    // QRIS is valid but provider is unknown — use local transformation
    return {
      qrisString: staticToDynamic(qrisString, options),
      source: "local",
      provider: "generic",
      amount: options.amount,
    };
  }

  return provider.toDynamic(qrisString, options);
}
