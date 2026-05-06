import { ProviderAdapter } from "./base";

export const xenditProvider = new ProviderAdapter({
  code: "xendit",
  name: "Xendit",
  aliases: ["xendit"],
  merchantInfoTagIds: ["26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "51"],
  identifiers: ["xendit"],
  supportsApiDynamic: true,
  notes: "Gateway-backed QRIS creation is a good candidate for a later API integration layer.",
});
