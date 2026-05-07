import { Elysia } from "elysia";
import { getOrder } from "../lib/catalog";
import { applyWebhookPaymentStatus, cancelOrderPayment, createOrderPayment, expireOrderPayment, getPaymentCapabilities, refundOrderPayment, syncPaymentStatus } from "../lib/payments";
import { duitkuAdapter, midtransAdapter, xenditAdapter } from "qris-saurus";
import type { MidtransWebhookPayload } from "qris-saurus";
import type { AppConfig } from "../types";

function getXenditHeaders(request: Request): Record<string, string | string[] | undefined> {
  const headers: Record<string, string | string[] | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

export function createPaymentRoutes(config: AppConfig) {
  const qrisRoutes = new Elysia({ prefix: "/orders/:id/payments/qris" })
    .get("/", ({ params, set }) => {
      try {
        const order = getOrder(params.id);
        if (!order.payment) {
          set.status = 404;
          return { error: { message: `Order ${params.id} does not have a QRIS payment yet` } };
        }
        return { data: order.payment };
      } catch (error) {
        set.status = 404;
        return {
          error: {
            message: error instanceof Error ? error.message : "Order not found",
          },
        };
      }
    })
    .post("/", async ({ params, set }) => {
      try {
        const order = getOrder(params.id);
        const updatedOrder = await createOrderPayment(order, config);
        return {
          data: {
            orderId: updatedOrder.id,
            amount: updatedOrder.total,
            status: updatedOrder.payment?.status,
            payment: updatedOrder.payment,
          },
        };
      } catch (error) {
        set.status = 400;
        return {
          error: {
            message: error instanceof Error ? error.message : "Failed to create QRIS payment",
          },
        };
      }
    })
    .get("/status", async ({ params, set }) => {
      try {
        const order = getOrder(params.id);
        const result = await syncPaymentStatus(order, config);
        return {
          data: {
            orderId: order.id,
            paymentStatus: result.paymentStatus,
            orderStatus: result.orderStatus,
          },
        };
      } catch (error) {
        set.status = 400;
        return {
          error: {
            message: error instanceof Error ? error.message : "Failed to sync payment status",
          },
        };
      }
    })
    .post("/cancel", async ({ params, set }) => {
      try {
        const order = getOrder(params.id);
        const updatedOrder = await cancelOrderPayment(order, config);
        return { data: updatedOrder };
      } catch (error) {
        set.status = 400;
        return {
          error: {
            message: error instanceof Error ? error.message : "Failed to cancel payment",
          },
        };
      }
    })
    .post("/expire", async ({ params, set }) => {
      try {
        const order = getOrder(params.id);
        const updatedOrder = await expireOrderPayment(order, config);
        return { data: updatedOrder };
      } catch (error) {
        set.status = 400;
        return {
          error: {
            message: error instanceof Error ? error.message : "Failed to expire payment",
          },
        };
      }
    })
    .post("/refund", async ({ params, body, set }) => {
      try {
        const order = getOrder(params.id);
        const { amount } = body as { amount?: number };
        const updatedOrder = await refundOrderPayment(order, config, amount);
        return { data: updatedOrder };
      } catch (error) {
        set.status = 400;
        return {
          error: {
            message: error instanceof Error ? error.message : "Failed to refund payment",
          },
        };
      }
    })
    .get("/capabilities", () => ({ data: getPaymentCapabilities(config) }))
    .post("/simulate-settle", async ({ params, set }) => {
      try {
        const order = getOrder(params.id);
        if (!order.payment) {
          set.status = 400;
          return { error: { message: "Order has no payment to settle" } };
        }
        if (order.payment.status !== "pending") {
          set.status = 400;
          return { error: { message: `Payment already has status: ${order.payment.status}` } };
        }
        const updatedOrder = applyWebhookPaymentStatus(order, order.payment.mode as "midtrans" | "xendit" | "duitku", {
          order_id: order.id,
          transaction_status: "settlement",
          status_code: "200",
          gross_amount: String(order.payment.amount),
          // Xendit/Duitku compat
          status: "SUCCEEDED",
          statusCode: "00",
          reference_id: order.id,
          merchantOrderId: order.id,
        });
        return {
          data: {
            orderId: updatedOrder.id,
            orderStatus: updatedOrder.status,
            paymentStatus: updatedOrder.payment?.status,
          },
        };
      } catch (error) {
        set.status = 400;
        return {
          error: {
            message: error instanceof Error ? error.message : "Failed to simulate settlement",
          },
        };
      }
    });

  const webhookRoutes = new Elysia({ prefix: "/webhooks" })
    .post("/midtrans", ({ body, set }) => {
      if (!config.gateway.midtrans) {
        set.status = 400;
        return { error: { message: "Midtrans gateway is not configured" } };
      }

      const payload = body as MidtransWebhookPayload;
      const parsedWebhook = midtransAdapter.parseWebhook(payload, {
        serverKey: config.gateway.midtrans.serverKey,
      });
      if (!parsedWebhook.valid) {
        set.status = 403;
        return { error: { message: "Invalid Midtrans webhook signature" } };
      }

      const orderId = parsedWebhook.orderId;
      try {
        const order = getOrder(orderId);
        const updatedOrder = applyWebhookPaymentStatus(order, "midtrans", payload);
        return { data: { provider: "midtrans", orderId, paymentStatus: updatedOrder.payment?.status, orderStatus: updatedOrder.status } };
      } catch (error) {
        set.status = 404;
        return { error: { message: error instanceof Error ? error.message : "Order not found" } };
      }
    })
    .post("/xendit", ({ body, request, set }) => {
      if (!config.gateway.xendit || !config.webhook.xenditCallbackToken) {
        set.status = 400;
        return { error: { message: "Xendit gateway or callback token is not configured" } };
      }

      const valid = xenditAdapter.verifyWebhook(getXenditHeaders(request), config.webhook.xenditCallbackToken);
      if (!valid) {
        set.status = 403;
        return { error: { message: "Invalid Xendit callback token" } };
      }

      const payload = body as Record<string, unknown>;
      const orderId = String(payload.reference_id ?? payload.external_id ?? payload.id ?? "");
      try {
        const order = getOrder(orderId);
        const updatedOrder = applyWebhookPaymentStatus(order, "xendit", payload);
        return { data: { provider: "xendit", orderId, paymentStatus: updatedOrder.payment?.status, orderStatus: updatedOrder.status } };
      } catch (error) {
        set.status = 404;
        return { error: { message: error instanceof Error ? error.message : "Order not found" } };
      }
    })
    .post("/duitku", ({ body, set }) => {
      if (!config.gateway.duitku) {
        set.status = 400;
        return { error: { message: "Duitku gateway is not configured" } };
      }

      const payload = body as Record<string, unknown>;
      const valid = duitkuAdapter.verifyWebhook(payload, {
        merchantCode: config.gateway.duitku.merchantCode,
        merchantKey: config.gateway.duitku.merchantKey,
      });
      if (!valid) {
        set.status = 403;
        return { error: { message: "Invalid Duitku webhook signature" } };
      }

      const orderId = String(payload.merchantOrderId ?? "");
      try {
        const order = getOrder(orderId);
        const updatedOrder = applyWebhookPaymentStatus(order, "duitku", payload);
        return { data: { provider: "duitku", orderId, paymentStatus: updatedOrder.payment?.status, orderStatus: updatedOrder.status } };
      } catch (error) {
        set.status = 404;
        return { error: { message: error instanceof Error ? error.message : "Order not found" } };
      }
    });

  return new Elysia().use(qrisRoutes).use(webhookRoutes);
}

