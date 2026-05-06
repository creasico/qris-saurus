import { describe, expect, test } from "bun:test";
import type { PaymentStatusResult } from "../../../src/core/types";
import { pollUntilSettled } from "../../../src/providers/adapters/poller";

function makeResult(status: PaymentStatusResult["status"]): PaymentStatusResult {
  return { orderId: "INV-001", status, raw: {} };
}

describe("pollUntilSettled", () => {
  test("returns immediately when checker returns a terminal status", async () => {
    let calls = 0;
    const checker = async () => {
      calls++;
      return makeResult("paid");
    };

    const result = await pollUntilSettled(checker, { intervalMs: 1 });
    expect(result.status).toBe("paid");
    expect(calls).toBe(1);
  });

  test("retries until a terminal status is returned", async () => {
    let calls = 0;
    const checker = async (): Promise<PaymentStatusResult> => {
      calls++;
      if (calls < 4) return makeResult("pending");
      return makeResult("paid");
    };

    const result = await pollUntilSettled(checker, { intervalMs: 1 });
    expect(result.status).toBe("paid");
    expect(calls).toBe(4);
  });

  test("returns on 'expired' terminal status", async () => {
    const checker = async () => makeResult("expired");
    const result = await pollUntilSettled(checker, { intervalMs: 1 });
    expect(result.status).toBe("expired");
  });

  test("returns on 'failed' terminal status", async () => {
    const checker = async () => makeResult("failed");
    const result = await pollUntilSettled(checker, { intervalMs: 1 });
    expect(result.status).toBe("failed");
  });

  test("returns on 'cancelled' terminal status", async () => {
    const checker = async () => makeResult("cancelled");
    const result = await pollUntilSettled(checker, { intervalMs: 1 });
    expect(result.status).toBe("cancelled");
  });

  test("throws when timeout elapses before terminal status", async () => {
    const checker = async () => makeResult("pending");

    await expect(
      pollUntilSettled(checker, { intervalMs: 1, timeoutMs: 5 }),
    ).rejects.toThrow("timed out");
  });

  test("throws with timeout value in message", async () => {
    const checker = async () => makeResult("pending");

    await expect(
      pollUntilSettled(checker, { intervalMs: 1, timeoutMs: 42 }),
    ).rejects.toThrow("42ms");
  });
});
