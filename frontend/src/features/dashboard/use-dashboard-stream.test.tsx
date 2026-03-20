import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDashboardStream } from "@/features/dashboard/use-dashboard-stream";
import type { SolanaBalancesResponse, TransactionStreamResponse, TreasuryValuation } from "@/types";

import { dashboardKeys } from "./query-keys";

const queryClientMock = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  setQueryData: vi.fn(),
}));

const fetchTransactionStreamTokenMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClientMock,
}));

vi.mock("@/features/session/use-api-client", () => ({
  useApiClient: () => ({
    fetchTransactionStreamToken: fetchTransactionStreamTokenMock,
  }),
}));

vi.mock("@/lib/api-client", () => ({
  API_BASE_URL: "http://localhost:4000",
}));

class MockEventSource {
  static instances: MockEventSource[] = [];

  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: (() => void) | null = null;
  readonly url: string;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
}

interface DashboardSnapshot {
  balances: SolanaBalancesResponse["balances"];
  valuation: TreasuryValuation;
  transactions: TransactionStreamResponse["transactions"];
}

describe("useDashboardStream", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    queryClientMock.invalidateQueries.mockReset();
    queryClientMock.setQueryData.mockReset();
    fetchTransactionStreamTokenMock.mockReset();
    fetchTransactionStreamTokenMock.mockResolvedValue({ token: "stream-token" });
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("merges streamed valuation updates into the dashboard snapshot cache", async () => {
    let applyUpdate: ((current: DashboardSnapshot | undefined) => DashboardSnapshot) | null = null;

    queryClientMock.setQueryData.mockImplementation((queryKey, updater) => {
      expect(queryKey).toEqual(dashboardKeys.snapshot("user-1"));
      applyUpdate = updater as (current: DashboardSnapshot | undefined) => DashboardSnapshot;
    });

    renderHook(() => useDashboardStream("user-1"));

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
    });

    const stream = MockEventSource.instances[0];
    const payload: TransactionStreamResponse = {
      balances: {
        sol: { formatted: "1.20", raw: "1200000000" },
        usdc: { formatted: "25.00", raw: "25000000" },
        eurc: { formatted: "10.00", raw: "10000000" },
      },
      valuation: {
        treasuryValueUsd: "215.80",
        assetValuesUsd: {
          sol: "180.00",
          usdc: "25.00",
          eurc: "10.80",
        },
        pricesUsd: {
          sol: "150.00",
          usdc: "1.00",
          eurc: "1.08",
        },
        lastUpdatedAt: "2026-03-20T09:00:02.000Z",
        isStale: false,
        unavailableAssets: [],
      },
      transactions: [],
    };

    stream.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);

    expect(queryClientMock.setQueryData).toHaveBeenCalledTimes(1);
    expect(applyUpdate).not.toBeNull();
    if (!applyUpdate) {
      throw new Error("Expected query cache updater.");
    }
    const updateSnapshot = applyUpdate as (current: DashboardSnapshot | undefined) => DashboardSnapshot;

    const nextSnapshot = updateSnapshot({
      balances: {
        sol: { formatted: "1.00", raw: "1000000000" },
        usdc: { formatted: "20.00", raw: "20000000" },
        eurc: { formatted: "5.00", raw: "5000000" },
      },
      valuation: {
        treasuryValueUsd: "175.40",
        assetValuesUsd: {
          sol: "150.00",
          usdc: "20.00",
          eurc: "5.40",
        },
        pricesUsd: {
          sol: "150.00",
          usdc: "1.00",
          eurc: "1.08",
        },
        lastUpdatedAt: "2026-03-20T09:00:01.000Z",
        isStale: false,
        unavailableAssets: [],
      },
      transactions: [],
    });

    expect(nextSnapshot?.balances).toEqual(payload.balances);
    expect(nextSnapshot?.valuation).toEqual(payload.valuation);
    expect(nextSnapshot?.transactions).toEqual(payload.transactions);
  });
});
