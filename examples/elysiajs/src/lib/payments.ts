import {
  detectProvider,
  duitkuAdapter,
  listProviders,
  makeDynamic,
  midtransAdapter,
  renderQrToDataUrl,
  staticToDynamic,
  xenditAdapter,
} from "qris-saurus";
import type { MidtransWebhookPayload } from "qris-saurus";
import type {
  AppConfig,
  GatewayPaymentResult,
  LocalPaymentResult,
  Order,
  OrderPayment,
  PaymentMode,
  PaymentStatusSyncResult,
  WebhookProvider,
} from "../types";
import { getOrder, saveOrder } from "./catalog";

function resolveOrderStatus(status: OrderPayment["status"]): Order["status"] {
  if (status === "paid") return "paid";
  if (status === "expired") return "expired";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

function resolveWebhookPaymentStatus(provider: WebhookProvider, payload: Record<string, unknown>): OrderPayment["status"] {
  if (provider === "midtrans") {
    return midtransAdapter.getWebhookStatus(payload as MidtransWebhookPayload);
  }

  if (provider === "xendit") {
    const status = String(payload.status ?? payload.payment_status ?? payload.transaction_status ?? "pending").toUpperCase();
    if (status === "SUCCEEDED" || status === "PAID") return "paid";
    if (status === "EXPIRED") return "expired";
    if (status === "FAILED") return "failed";
    if (status === "CANCELLED") return "cancelled";
    if (status === "REFUNDED") return "refunded";
    return "pending";
  }

  const statusCode = String(payload.statusCode ?? payload.status_code ?? "01");
  if (statusCode === "00") return "paid";
  if (statusCode === "02") return "cancelled";
  return "pending";
}

function chooseGatewayMode(config: AppConfig): Exclude<PaymentMode, "auto" | "local"> | null {
  if (config.paymentMode === "midtrans" || config.paymentMode === "xendit" || config.paymentMode === "duitku") {
    return config.paymentMode;
  }

  if (config.paymentMode === "auto") {
    const provider = detectProvider(config.merchantQrisStatic)?.info.code;
    if (provider === "midtrans" && config.gateway.midtrans) return "midtrans";
    if (provider === "xendit" && config.gateway.xendit) return "xendit";
    if (provider === "duitku" && config.gateway.duitku) return "duitku";
  }

  return null;
}

async function createGatewayPayment(order: Order, config: AppConfig): Promise<GatewayPaymentResult | null> {
  const mode = chooseGatewayMode(config);
  if (!mode) {
    return null;
  }

  const options = {
    orderId: order.id,
    amount: order.total,
    description: `Pembayaran order ${order.id}`,
    ...(order.customerEmail ? { customerEmail: order.customerEmail } : {}),
  };

  if (mode === "midtrans" && config.gateway.midtrans) {
    return {
      provider: "midtrans",
      source: "api",
      mode,
      result: await midtransAdapter.createDynamicQr(options, config.gateway.midtrans),
    };
  }

  if (mode === "xendit" && config.gateway.xendit) {
    return {
      provider: "xendit",
      source: "api",
      mode,
      result: await xenditAdapter.createDynamicQr(options, config.gateway.xendit),
    };
  }

  if (mode === "duitku" && config.gateway.duitku) {
    return {
      provider: "duitku",
      source: "api",
      mode,
      result: await duitkuAdapter.createDynamicQr(options, config.gateway.duitku),
    };
  }

  return null;
}

function createLocalPayment(order: Order, config: AppConfig): LocalPaymentResult {
  const providerInfo = detectProvider(config.merchantQrisStatic);
  const result = makeDynamic(config.merchantQrisStatic, {
    amount: order.total,
    merchantRef: order.id,
    terminalLabel: "ECATALOG",
  });

  const qrisString = result.source === "local"
    ? staticToDynamic(config.merchantQrisStatic, {
        amount: order.total,
        merchantRef: order.id,
        terminalLabel: "ECATALOG",
      })
    : result.qrisString;

  return {
    provider: providerInfo?.info.code ?? result.provider,
    source: result.source,
    mode: "local",
    result: {
      ...result,
      qrisString,
    },
  };
}

function paymentRecordFromGateway(result: GatewayPaymentResult, qrDataUrl: string, amount: number): OrderPayment {
  return {
    provider: result.provider,
    source: result.source,
    mode: result.mode,
    amount,
    qrisString: result.result.qrisString,
    qrDataUrl,
    ...(result.result.qrImageUrl ? { qrImageUrl: result.result.qrImageUrl } : {}),
    gatewayOrderId: result.result.gatewayOrderId,
    ...(result.result.expiresAt ? { expiresAt: result.result.expiresAt.toISOString() } : {}),
    status: "pending",
    raw: result.result.raw,
  };
}

function paymentRecordFromLocal(result: LocalPaymentResult, qrDataUrl: string): OrderPayment {
  return {
    provider: result.provider,
    source: result.source,
    mode: result.mode,
    amount: result.result.amount,
    qrisString: result.result.qrisString,
    qrDataUrl,
    status: "pending",
    raw: result.result.raw,
  };
}

export function getPaymentCapabilities(config: AppConfig) {
  return {
    mode: config.paymentMode,
    providers: listProviders().map((provider) => ({
      code: provider.info.code,
      name: provider.info.name,
      supportsApiDynamic: provider.info.supportsApiDynamic,
    })),
    configuredGateways: {
      midtrans: Boolean(config.gateway.midtrans),
      xendit: Boolean(config.gateway.xendit),
      duitku: Boolean(config.gateway.duitku),
    },
    webhookRoutes: {
      midtrans: "/webhooks/midtrans",
      xendit: "/webhooks/xendit",
      duitku: "/webhooks/duitku",
    },
  };
}

export async function createOrderPayment(order: Order, config: AppConfig): Promise<Order> {
  if (order.payment && order.payment.status === "pending") {
    return order;
  }

  const gatewayPayment = await createGatewayPayment(order, config);
  const creationResult = gatewayPayment ?? createLocalPayment(order, config);
  const qrisString = creationResult.result.qrisString;
  const qrDataUrl = await renderQrToDataUrl(qrisString, { width: 360, margin: 2 });

  const payment = creationResult.mode === "local"
    ? paymentRecordFromLocal(creationResult, qrDataUrl)
    : paymentRecordFromGateway(creationResult, qrDataUrl, order.total);

  const updatedOrder: Order = {
    ...order,
    payment,
    status: resolveOrderStatus(payment.status),
  };

  return saveOrder(updatedOrder);
}

export function applyWebhookPaymentStatus(
  order: Order,
  provider: WebhookProvider,
  payload: Record<string, unknown>,
): Order {
  if (!order.payment) {
    throw new Error(`Order ${order.id} does not have a QRIS payment`);
  }

  const status = resolveWebhookPaymentStatus(provider, payload);
  const updatedPayment: OrderPayment = {
    ...order.payment,
    status,
    raw: payload,
  };

  const updatedOrder: Order = {
    ...order,
    payment: updatedPayment,
    status: resolveOrderStatus(status),
  };

  return saveOrder(updatedOrder);
}

export async function syncPaymentStatus(order: Order, config: AppConfig): Promise<PaymentStatusSyncResult> {
  if (!order.payment) {
    throw new Error(`Order ${order.id} does not have a QRIS payment`);
  }

  if (order.payment.mode === "local") {
    return {
      paymentStatus: {
        orderId: order.id,
        status: order.payment.status,
        amount: order.payment.amount,
        raw: order.payment.raw ?? null,
      },
      orderStatus: order.status,
    };
  }

  const paymentStatus = order.payment.mode === "midtrans" && config.gateway.midtrans
    ? await midtransAdapter.checkPaymentStatus(order.payment.gatewayOrderId ?? order.id, config.gateway.midtrans)
    : order.payment.mode === "xendit" && config.gateway.xendit
      ? await xenditAdapter.checkPaymentStatus(order.payment.gatewayOrderId ?? order.id, config.gateway.xendit)
      : order.payment.mode === "duitku" && config.gateway.duitku
        ? await duitkuAdapter.checkPaymentStatus(order.payment.gatewayOrderId ?? order.id, config.gateway.duitku)
        : {
            orderId: order.id,
            status: order.payment.status,
            amount: order.payment.amount,
            raw: order.payment.raw ?? null,
          };

  const updatedPayment: OrderPayment = {
    ...order.payment,
    status: paymentStatus.status,
    raw: paymentStatus.raw,
  };

  const updatedOrder: Order = {
    ...order,
    payment: updatedPayment,
    status: resolveOrderStatus(paymentStatus.status),
  };

  saveOrder(updatedOrder);

  return {
    paymentStatus,
    orderStatus: updatedOrder.status,
  };
}

export async function cancelOrderPayment(order: Order, config: AppConfig): Promise<Order> {
  if (!order.payment) {
    throw new Error(`Order ${order.id} does not have a QRIS payment`);
  }

  if (order.payment.mode === "midtrans" && config.gateway.midtrans) {
    await midtransAdapter.cancel(order.payment.gatewayOrderId ?? order.id, config.gateway.midtrans);
    return syncPaymentStatus(order, config).then(() => getOrder(order.id));
  }

  throw new Error(`Cancellation is not supported for ${order.payment.mode} in this example`);
}

export async function expireOrderPayment(order: Order, config: AppConfig): Promise<Order> {
  if (!order.payment) {
    throw new Error(`Order ${order.id} does not have a QRIS payment`);
  }

  if (order.payment.mode === "midtrans" && config.gateway.midtrans) {
    await midtransAdapter.expire(order.payment.gatewayOrderId ?? order.id, config.gateway.midtrans);
    return syncPaymentStatus(order, config).then(() => getOrder(order.id));
  }

  throw new Error(`Manual expiration is not supported for ${order.payment.mode} in this example`);
}

export async function refundOrderPayment(order: Order, config: AppConfig, amount?: number): Promise<Order> {
  if (!order.payment) {
    throw new Error(`Order ${order.id} does not have a QRIS payment`);
  }

  if (order.payment.mode === "midtrans" && config.gateway.midtrans) {
    const refundOptions: { amount?: number } = {};
    if (amount !== undefined) refundOptions.amount = amount;
    await midtransAdapter.refund(order.payment.gatewayOrderId ?? order.id, config.gateway.midtrans, refundOptions);
    return syncPaymentStatus(order, config).then(() => getOrder(order.id));
  }

  throw new Error(`Refund is not supported for ${order.payment.mode} in this example`);
}
