import { ProviderAdapter } from "./base";

export const gopayProvider = new ProviderAdapter({
  code: "gopay",
  name: "GoPay",
  aliases: ["gopay", "go pay", "gopay merchant"],
  merchantInfoTagIds: ["26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51"],
  identifiers: ["gopay", "gopayid", "gopay merchant"],
  supportsApiDynamic: false,
  notes: "Treat as local QRIS transform first; API-based QRIS generation may come via aggregator flows rather than a generic public endpoint.",
});
