import type { PaymentStatusResult } from "../../core/types";

export interface PollOptions {
  /** Time between status checks in milliseconds. Default: 3000 */
  intervalMs?: number;
  /** Maximum total wait time before throwing. Default: 300_000 (5 minutes) */
  timeoutMs?: number;
}

const TERMINAL_STATUSES = new Set<string>(["paid", "expired", "failed", "cancelled"]);

/**
 * Polls a payment status checker until a terminal status (paid, expired,
 * failed, or cancelled) is reached, or the timeout elapses.
 *
 * @throws {Error} if the timeout elapses before a terminal status is received.
 *
 * @example
 *   const result = await pollUntilSettled(
 *     () => midtransAdapter.checkPaymentStatus("INV-001", config),
 *     { intervalMs: 3_000, timeoutMs: 60_000 },
 *   );
 */
export async function pollUntilSettled(
  checker: () => Promise<PaymentStatusResult>,
  options: PollOptions = {},
): Promise<PaymentStatusResult> {
  const intervalMs = options.intervalMs ?? 3_000;
  const timeoutMs = options.timeoutMs ?? 300_000;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const result = await checker();

    if (TERMINAL_STATUSES.has(result.status)) {
      return result;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }

    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(intervalMs, remaining)),
    );
  }

  throw new Error(`Payment status polling timed out after ${timeoutMs}ms`);
}
