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

  constructor(private readonly bufferSeconds: number = 60) {}

  /**
   * Return a valid access token for `cacheKey`.
   * Fetches a fresh token via `fetcher` when the cache is empty or the
   * cached token will expire within `bufferSeconds`.
   */
  async getToken(cacheKey: string, fetcher: TokenFetcher): Promise<string> {
    const cached = this.cache.get(cacheKey);
    const now = Date.now();
    const bufferMs = this.bufferSeconds * 1000;

    if (cached && cached.expiresAt - bufferMs > now) {
      return cached.accessToken;
    }

    const { accessToken, expiresInSeconds } = await fetcher();

    this.cache.set(cacheKey, {
      accessToken,
      expiresAt: now + expiresInSeconds * 1000,
    });

    return accessToken;
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
