import { ProviderAdapter } from "./base";

export const shopeepayProvider = new ProviderAdapter({
  code: "shopeepay",
  name: "ShopeePay",
  aliases: ["shopeepay", "shopee pay"],
  merchantInfoTagIds: ["26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51"],
  identifiers: ["shopee"],
  supportsApiDynamic: false,
  notes: "Standalone public dynamic QRIS API evidence is limited; use local QRIS transformation by default.",
});
