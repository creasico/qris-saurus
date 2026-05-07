import type { Order } from "../types";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PERSIST_FILE = join(process.cwd(), ".orders_db.json");

class PersistentMap extends Map<string, Order> {
  constructor() {
    super();
    this.load();
  }

  private load() {
    try {
      if (existsSync(PERSIST_FILE)) {
        const data = JSON.parse(readFileSync(PERSIST_FILE, "utf-8"));
        for (const [k, v] of Object.entries(data)) {
          this.set(k, v as Order);
        }
      }
    } catch (e) {
      console.error("Failed to load orders db", e);
    }
  }

  private save() {
    try {
      const data = Object.fromEntries(this.entries());
      writeFileSync(PERSIST_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error("Failed to save orders db", e);
    }
  }

  set(key: string, value: Order) {
    const res = super.set(key, value);
    this.save();
    return res;
  }

  delete(key: string) {
    const res = super.delete(key);
    this.save();
    return res;
  }

  clear() {
    super.clear();
    this.save();
  }
}

export const orders = new PersistentMap();
