import { logError, logInfo } from "./logger.js";

const DEFAULT_YIELD_PORTFOLIO_CACHE_TTL_MS = 30_000;

interface YieldPortfolioCacheEntry {
  currentPositionRaw: string;
  expiresAt: number;
  fetchedAt: number;
}

const yieldPortfolioCache = new Map<string, YieldPortfolioCacheEntry>();
const yieldPortfolioRefreshInFlight = new Map<string, Promise<string>>();

export async function readCachedUsdcYieldCurrentPositionRaw(input: {
  walletAddress: string;
  fetcher: (walletAddress: string) => Promise<string>;
  now?: number;
  ttlMs?: number;
}) {
  const now = input.now ?? Date.now();
  const ttlMs = input.ttlMs ?? DEFAULT_YIELD_PORTFOLIO_CACHE_TTL_MS;
  const existingEntry = yieldPortfolioCache.get(input.walletAddress);

  if (existingEntry && now <= existingEntry.expiresAt) {
    logInfo("yield.portfolio_cache_hit", {
      ageMs: now - existingEntry.fetchedAt,
      walletAddress: input.walletAddress,
    });
    return existingEntry.currentPositionRaw;
  }

  if (existingEntry) {
    logInfo("yield.portfolio_cache_stale_hit", {
      ageMs: now - existingEntry.fetchedAt,
      walletAddress: input.walletAddress,
    });
    void refreshCachedUsdcYieldCurrentPositionRaw({
      fetcher: input.fetcher,
      reason: "stale",
      ttlMs,
      walletAddress: input.walletAddress,
    }).catch(() => undefined);
    return existingEntry.currentPositionRaw;
  }

  logInfo("yield.portfolio_cache_miss", {
    walletAddress: input.walletAddress,
  });
  return refreshCachedUsdcYieldCurrentPositionRaw({
    fetcher: input.fetcher,
    reason: "miss",
    ttlMs,
    walletAddress: input.walletAddress,
  });
}

export function markUsdcYieldCurrentPositionCacheStale(walletAddress: string | null | undefined) {
  if (!walletAddress) {
    return;
  }

  const existingEntry = yieldPortfolioCache.get(walletAddress);
  if (!existingEntry) {
    return;
  }

  yieldPortfolioCache.set(walletAddress, {
    ...existingEntry,
    expiresAt: 0,
  });
  logInfo("yield.portfolio_cache_marked_stale", {
    walletAddress,
  });
}

export function resetYieldPortfolioCacheForTests() {
  yieldPortfolioCache.clear();
  yieldPortfolioRefreshInFlight.clear();
}

async function refreshCachedUsdcYieldCurrentPositionRaw(input: {
  walletAddress: string;
  fetcher: (walletAddress: string) => Promise<string>;
  reason: "miss" | "stale";
  ttlMs: number;
}) {
  const existingRefresh = yieldPortfolioRefreshInFlight.get(input.walletAddress);
  if (existingRefresh) {
    return existingRefresh;
  }

  const startedAt = Date.now();
  const refreshPromise = input
    .fetcher(input.walletAddress)
    .then(currentPositionRaw => {
      const fetchedAt = Date.now();
      yieldPortfolioCache.set(input.walletAddress, {
        currentPositionRaw,
        expiresAt: fetchedAt + input.ttlMs,
        fetchedAt,
      });
      logInfo("yield.portfolio_cache_refresh_succeeded", {
        durationMs: fetchedAt - startedAt,
        reason: input.reason,
        walletAddress: input.walletAddress,
      });
      return currentPositionRaw;
    })
    .catch(error => {
      logError("yield.portfolio_cache_refresh_failed", error, {
        durationMs: Date.now() - startedAt,
        reason: input.reason,
        walletAddress: input.walletAddress,
      });
      throw error;
    })
    .finally(() => {
      yieldPortfolioRefreshInFlight.delete(input.walletAddress);
    });

  yieldPortfolioRefreshInFlight.set(input.walletAddress, refreshPromise);
  return refreshPromise;
}
