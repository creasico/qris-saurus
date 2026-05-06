import { Elysia } from "elysia";
import { getProduct, listProducts } from "../lib/catalog";

export const catalogRoutes = new Elysia({ prefix: "/products" })
  .get("/", () => ({ data: listProducts() }))
  .get("/:id", ({ params, set }) => {
    try {
      return { data: getProduct(params.id) };
    } catch (error) {
      set.status = 404;
      return {
        error: {
          message: error instanceof Error ? error.message : "Product not found",
        },
      };
    }
  });
