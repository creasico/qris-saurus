import type { Product } from "../types";

export const products: Product[] = [
  {
    id: "arabica-gayo-250g",
    name: "Arabica Gayo 250g",
    description: "Single origin roasted beans dengan notes cokelat dan citrus.",
    price: 85000,
    stock: 20,
    emoji: "☕",
  },
  {
    id: "robusta-temanggung-500g",
    name: "Robusta Temanggung 500g",
    description: "Body tebal untuk espresso blend dan kopi susu.",
    price: 110000,
    stock: 15,
    emoji: "🫘",
  },
  {
    id: "drip-bag-starter-pack",
    name: "Drip Bag Starter Pack",
    description: "Paket 5 drip bag untuk percobaan rasa harian.",
    price: 65000,
    stock: 30,
    emoji: "🎒",
  },
];
