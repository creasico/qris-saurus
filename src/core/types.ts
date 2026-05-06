export interface TlvNode {
  id: string;
  length: number;
  value: string;
  children?: TlvNode[];
}

export interface QrisData {
  raw: string;
  nodes: TlvNode[];
  crc: string;
}

export interface DynamicOptions {
  amount: number;
  tipType?: "none" | "fixed" | "percent";
  tipValue?: number;
  merchantRef?: string;
  terminalLabel?: string;
}

export interface DynamicResult {
  qrisString: string;
  source: "local" | "api";
  provider: string;
  amount: number;
  raw?: unknown;
}

export interface ProviderInfo {
  code: string;
  name: string;
  aliases: string[];
  merchantInfoTagIds: string[];
  identifiers: string[];
  supportsApiDynamic: boolean;
  notes?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
