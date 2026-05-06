export interface FetchTokenResult {
  accessToken: string;
  /** Validity duration in seconds (e.g. 3600 for 1 hour). */
  expiresInSeconds: number;
}

export type TokenFetcher = () => Promise<FetchTokenResult>;

interface TokenEntry {
  accessToken: string;
  expiresAt: number; // unix ms
}

/**
 * TokenManager caches OAuth 2.0 access tokens and automatically refreshes
 * them before expiry. A configurable buffer (default: 60 seconds) prevents
 * tokens from being used in the window right before they expire.
 *
 * @example B2B OAuth 2.0 client credentials flow:
 *
 *   const token = await tokenManager.getToken("my-provider", async () => {
 *     const res = await fetch("https://provider.com/oauth/token", {
 *       method: "POST",
 *       headers: { "Content-Type": "application/x-www-form-urlencoded" },
 *       body: new URLSearchParams({
 *         grant_type: "client_credentials",
 *         client_id: "YOUR_CLIENT_ID",
 *         client_secret: "YOUR_CLIENT_SECRET",
 *       }),
 *     });
 *     const data = await res.json();
 *     return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
 *   });
 */
export class TokenManager {
  private readonly cache = new Map<string, TokenEntry>();
  private readonly inFlight = new Map<string, Promise<FetchTokenResult>>();

  constructor(private readonly bufferSeconds: number = 60) {}

  /**
   * Return a valid access token for `cacheKey`.
   * Fetches a fresh token via `fetcher` when the cache is empty or the
   * cached token will expire within `bufferSeconds`.
   * Concurrent calls for the same cacheKey are deduplicated to prevent
   * multiple fetches in flight.
   */
  async getToken(cacheKey: string, fetcher: TokenFetcher): Promise<string> {
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    const bufferMs = this.bufferSeconds * 1000;

    if (cached && cached.expiresAt - bufferMs > now) {
      return cached.accessToken;
    }

    // Check if we already have an in-flight request for this cacheKey
    const inFlightPromise = this.inFlight.get(cacheKey);
    if (inFlightPromise) {
      const result = await inFlightPromise;
      return result.accessToken;
    }

    // Create new fetch promise and store it in inFlight
    const fetchPromise = fetcher();
    this.inFlight.set(cacheKey, fetchPromise);

    try {
      const { accessToken, expiresInSeconds } = await fetchPromise;

      this.cache.set(cacheKey, {
        accessToken,
        expiresAt: now + expiresInSeconds * 1000,
      });

      return accessToken;
    } finally {
      // Always remove from inFlight, even if fetch fails
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Remove a cached token — call this after receiving a 401 to force
   * re-authentication on the next request.
   */
  invalidate(cacheKey: string): void {
    this.cache.delete(cacheKey);
  }

  /** Remove all cached tokens. */
  clear(): void {
    this.cache.clear();
  }
}

/** Shared singleton token manager. Suitable for most use cases. */
export const tokenManager = new TokenManager();
