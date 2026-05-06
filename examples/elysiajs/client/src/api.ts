const SIMULATOR_URL = "https://simulator.sandbox.midtrans.com/v2/qris/index";

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  stock: number;
  emoji: string;
}

export interface OrderPayment {
  provider: string;
  source: string;
  mode: string;
  amount: number;
  qrisString: string;
  qrDataUrl: string;
  qrImageUrl?: string;
  gatewayOrderId?: string;
  expiresAt?: string;
  status: string;
  raw?: unknown;
}

export interface Order {
  id: string;
  customerEmail?: string;
  items: { productId: string; name: string; quantity: number; unitPrice: number; subtotal: number }[];
  total: number;
  status: string;
  createdAt: string;
  payment?: OrderPayment;
}

export function fmt(value: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

export function statusCls(s: string): string {
  if (s === "paid") return "s-paid";
  if (s === "cancelled") return "s-cancelled";
  if (s === "expired") return "s-expired";
  if (s === "failed") return "s-failed";
  if (s === "refunded") return "s-refunded";
  return "s-pending";
}

export async function fetchProducts(): Promise<Product[]> {
  const r = await fetch("/products");
  const j = await r.json();
  return j.data ?? [];
}

export async function createOrder(items: { productId: string; quantity: number }[], email?: string): Promise<Order> {
  const r = await fetch("/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items, ...(email ? { customerEmail: email } : {}) }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? "Gagal membuat order");
  return j.data;
}

export async function createPayment(orderId: string) {
  const r = await fetch(`/orders/${orderId}/payments/qris`, { method: "POST" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? "Gagal membuat payment");
  return j.data;
}

export async function refreshStatus(orderId: string) {
  const r = await fetch(`/orders/${orderId}/payments/qris/status`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? "Gagal refresh status");
  return j.data;
}

export async function simulateSettle(orderId: string) {
  const r = await fetch(`/orders/${orderId}/payments/qris/simulate-settle`, { method: "POST" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? "Gagal simulasi");
  return j.data;
}

export async function cancelPayment(orderId: string) {
  const r = await fetch(`/orders/${orderId}/payments/qris/cancel`, { method: "POST" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? "Gagal cancel");
  return j.data;
}

export async function expirePayment(orderId: string) {
  const r = await fetch(`/orders/${orderId}/payments/qris/expire`, { method: "POST" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? "Gagal expire");
  return j.data;
}

export async function refundPayment(orderId: string, amount?: number) {
  const r = await fetch(`/orders/${orderId}/payments/qris/refund`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? "Gagal refund");
  return j.data;
}

export async function fetchAllOrders(): Promise<Order[]> {
  const r = await fetch("/orders");
  const j = await r.json();
  return j.data ?? [];
}

export { SIMULATOR_URL };
