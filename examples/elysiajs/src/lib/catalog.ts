import { products } from "../data/products";
import { orders } from "../data/orders";
import type { CreateOrderInput, Order, OrderItem, Product } from "../types";

function makeOrderId(): string {
  return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function getProductOrThrow(productId: string): Product {
  const product = products.find((item) => item.id === productId);
  if (!product) {
    throw new Error(`Product not found: ${productId}`);
  }
  return product;
}

function toOrderItem(productId: string, quantity: number): OrderItem {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Quantity for ${productId} must be a positive integer`);
  }

  const product = getProductOrThrow(productId);
  if (quantity > product.stock) {
    throw new Error(`Requested quantity exceeds stock for ${product.name}`);
  }

  return {
    productId: product.id,
    name: product.name,
    quantity,
    unitPrice: product.price,
    subtotal: product.price * quantity,
  };
}

export function listProducts(): Product[] {
  return products;
}

export function getProduct(productId: string): Product {
  return getProductOrThrow(productId);
}

export function createOrder(input: CreateOrderInput): Order {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Order must contain at least one item");
  }

  const items = input.items.map((item) => toOrderItem(item.productId, item.quantity));
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);

  const order: Order = {
    id: makeOrderId(),
    items,
    total,
    status: "pending",
    createdAt: new Date().toISOString(),
    ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
  };

  orders.set(order.id, order);
  return order;
}

export function getOrder(orderId: string): Order {
  const order = orders.get(orderId);
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }
  return order;
}

export function saveOrder(order: Order): Order {
  orders.set(order.id, order);
  return order;
}
