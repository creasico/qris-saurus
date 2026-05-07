import type {
  ApiQrResult,
  DuitkuConfig,
  DynamicResult,
  MidtransConfig,
  PaymentStatusCode,
  PaymentStatusResult,
  XenditConfig,
} from "qris-saurus";

export type PaymentMode = "auto" | "local" | "midtrans" | "xendit" | "duitku";

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  emoji: string;
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface OrderPayment {
  provider: string;
  source: "local" | "api";
  mode: Exclude<PaymentMode, "auto">;
  amount: number;
  qrisString: string;
  qrDataUrl: string;
  qrImageUrl?: string;
  gatewayOrderId?: string;
  expiresAt?: string;
  status: PaymentStatusCode;
  raw?: unknown;
}

export interface Order {
  id: string;
  customerEmail?: string;
  items: OrderItem[];
  total: number;
  status: "pending" | "paid" | "cancelled" | "expired";
  createdAt: string;
  payment?: OrderPayment;
}

export interface CreateOrderInput {
  items: OrderItemInput[];
  customerEmail?: string;
}

export interface AppConfig {
  port: number;
  paymentMode: PaymentMode;
  merchantQrisStatic: string;
  webhook: {
    xenditCallbackToken?: string;
  };
  gateway: {
    midtrans?: MidtransConfig;
    xendit?: XenditConfig;
    duitku?: DuitkuConfig;
  };
}

export type WebhookProvider = "midtrans" | "xendit" | "duitku";

export interface GatewayPaymentResult {
  provider: string;
  source: "api";
  mode: Exclude<PaymentMode, "auto" | "local">;
  result: ApiQrResult;
}

export interface LocalPaymentResult {
  provider: string;
  source: DynamicResult["source"];
  mode: "local";
  result: DynamicResult;
}

export type PaymentCreationResult = GatewayPaymentResult | LocalPaymentResult;

export interface PaymentStatusSyncResult {
  paymentStatus: PaymentStatusResult;
  orderStatus: Order["status"];
}
