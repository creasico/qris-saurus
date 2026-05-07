import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product, Order } from "./api";
import * as api from "./api";

interface POSState {
  products: Product[];
  cart: Record<string, number>;
  customerEmail: string;
  currentOrder: Order | null;
  allOrders: Order[];
  loading: string;

  // Actions
  fetchProducts: () => Promise<void>;
  updateCart: (id: string, delta: number) => void;
  setCustomerEmail: (email: string) => void;
  createOrder: () => Promise<void>;
  createPayment: () => Promise<void>;
  refreshStatus: (id?: string) => Promise<void>;
  cancelPayment: () => Promise<void>;
  expirePayment: () => Promise<void>;
  refundPayment: (amount?: number) => Promise<void>;
  simulateSettle: (id: string) => Promise<void>;
  fetchAllOrders: () => Promise<void>;
  resetPOS: () => void;
}

export const useStore = create<POSState>()(
  persist(
    (set, get) => ({
      products: [],
      cart: {},
      customerEmail: "",
      currentOrder: null,
      allOrders: [],
      loading: "",

      fetchProducts: async () => {
        const data = await api.fetchProducts();
        set({ products: data });
      },

      updateCart: (id, delta) => {
        const cart = { ...get().cart };
        const q = Math.max(0, (cart[id] || 0) + delta);
        if (q > 0) cart[id] = q; else delete cart[id];
        set({ cart });
      },

      setCustomerEmail: (customerEmail) => set({ customerEmail }),

      createOrder: async () => {
        const { cart, customerEmail } = get();
        const items = Object.entries(cart).map(([productId, quantity]) => ({ productId, quantity }));
        if (!items.length) throw new Error("Pilih minimal 1 produk.");
        set({ loading: "order" });
        try {
          const order = await api.createOrder(items, customerEmail || undefined);
          set({ currentOrder: order, cart: {} });
        } finally {
          set({ loading: "" });
        }
      },

      createPayment: async () => {
        const { currentOrder } = get();
        if (!currentOrder) return;
        set({ loading: "payment" });
        try {
          const data = await api.createPayment(currentOrder.id);
          set({ currentOrder: { ...currentOrder, payment: data.payment } });
        } finally {
          set({ loading: "" });
        }
      },

      refreshStatus: async (id) => {
        const orderId = id || get().currentOrder?.id;
        if (!orderId) return;
        set({ loading: "refresh" });
        try {
          const data = await api.refreshStatus(orderId);
          const update = (o: Order) => o.id === orderId ? {
            ...o,
            status: data.orderStatus,
            payment: o.payment ? { ...o.payment, status: data.paymentStatus.status } : undefined
          } : o;

          set(state => ({
            currentOrder: state.currentOrder ? update(state.currentOrder) : null,
            allOrders: state.allOrders.map(update)
          }));
        } finally {
          set({ loading: "" });
        }
      },

      cancelPayment: async () => {
        const { currentOrder } = get();
        if (!currentOrder) return;
        const data = await api.cancelPayment(currentOrder.id);
        set({ currentOrder: data });
      },

      expirePayment: async () => {
        const { currentOrder } = get();
        if (!currentOrder) return;
        const data = await api.expirePayment(currentOrder.id);
        set({ currentOrder: data });
      },

      refundPayment: async (amount) => {
        const { currentOrder } = get();
        if (!currentOrder) return;
        const data = await api.refundPayment(currentOrder.id, amount);
        set({ currentOrder: data });
      },

      simulateSettle: async (id) => {
        set({ loading: "settle" });
        try {
          await api.simulateSettle(id);
          await get().fetchAllOrders();
          if (get().currentOrder?.id === id) {
            await get().refreshStatus(id);
          }
        } finally {
          set({ loading: "" });
        }
      },

      fetchAllOrders: async () => {
        const data = await api.fetchAllOrders();
        set({ allOrders: data });
      },

      resetPOS: () => set({ currentOrder: null, cart: {}, customerEmail: "" }),
    }),
    {
      name: "qris-saurus-pos-storage",
      partialize: (state) => ({
        cart: state.cart,
        customerEmail: state.customerEmail,
        currentOrder: state.currentOrder,
      }),
    }
  )
);
