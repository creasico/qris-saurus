import { describe, expect, test } from "bun:test";
import { TokenManager } from "../../../src/providers/adapters/token-manager";

describe("TokenManager", () => {
  test("fetches token when cache is empty", async () => {
    const manager = new TokenManager();
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { accessToken: "tok-abc", expiresInSeconds: 3600 };
    };

    const token = await manager.getToken("k1", fetcher);
    expect(token).toBe("tok-abc");
    expect(calls).toBe(1);
  });

  test("returns cached token on subsequent calls", async () => {
    const manager = new TokenManager();
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { accessToken: "tok-xyz", expiresInSeconds: 3600 };
    };

    await manager.getToken("k1", fetcher);
    await manager.getToken("k1", fetcher);
    await manager.getToken("k1", fetcher);
    expect(calls).toBe(1);
  });

  test("re-fetches when token is within buffer window", async () => {
    // Buffer = 120s, token expires in 60s → should re-fetch immediately
    const manager = new TokenManager(120);
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { accessToken: `tok-${calls}`, expiresInSeconds: 60 };
    };

    const first = await manager.getToken("k1", fetcher);
    const second = await manager.getToken("k1", fetcher);
    expect(calls).toBe(2);
    expect(first).toBe("tok-1");
    expect(second).toBe("tok-2");
  });

  test("caches tokens independently per key", async () => {
    const manager = new TokenManager();
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { accessToken: `tok-${calls}`, expiresInSeconds: 3600 };
    };

    const a = await manager.getToken("key-a", fetcher);
    const b = await manager.getToken("key-b", fetcher);
    expect(a).toBe("tok-1");
    expect(b).toBe("tok-2");
    expect(calls).toBe(2);

    // both now cached
    await manager.getToken("key-a", fetcher);
    await manager.getToken("key-b", fetcher);
    expect(calls).toBe(2);
  });

  test("invalidate forces re-fetch on next call", async () => {
    const manager = new TokenManager();
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { accessToken: `tok-${calls}`, expiresInSeconds: 3600 };
    };

    await manager.getToken("k1", fetcher);
    manager.invalidate("k1");
    const second = await manager.getToken("k1", fetcher);
    expect(calls).toBe(2);
    expect(second).toBe("tok-2");
  });

  test("clear removes all cached tokens", async () => {
    const manager = new TokenManager();
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { accessToken: `tok-${calls}`, expiresInSeconds: 3600 };
    };

    await manager.getToken("k1", fetcher);
    await manager.getToken("k2", fetcher);
    manager.clear();
    await manager.getToken("k1", fetcher);
    await manager.getToken("k2", fetcher);
    expect(calls).toBe(4);
  });
});
