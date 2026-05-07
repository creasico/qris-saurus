import { Elysia } from "elysia";
import { catalogRoutes } from "./routes/catalog";
import { orderRoutes } from "./routes/orders";
import { createPaymentRoutes } from "./routes/payments";
import type { AppConfig } from "./types";
import { orders } from "./data/orders";

export function createApp(config: AppConfig) {
  return new Elysia()
    .get("/health", () => ({
      data: {
        status: "ok",
        paymentMode: config.paymentMode,
      },
    }))
    .get("/orders", () => ({
      data: Array.from(orders.values()).reverse(),
    }))
    .use(catalogRoutes)
    .use(orderRoutes)
    .use(createPaymentRoutes(config));
}
