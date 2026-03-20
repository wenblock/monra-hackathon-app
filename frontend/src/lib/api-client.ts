import type {
  BridgeStatusResponse,
  CreateSwapOrderPayload,
  CreateOfframpPayload,
  CreateOnrampPayload,
  CreateRecipientPayload,
  ExecuteSwapPayload,
  FetchSolanaTransactionContextPayload,
  OnboardingPayload,
  Recipient,
  RecipientListResponse,
  SessionBootstrapResponse,
  SolanaBalancesResponse,
  SolanaTransactionContextResponse,
  SwapExecuteResponse,
  SwapOrderResponse,
  StreamTokenResponse,
  TransactionListResponse,
} from "@/types";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

if (import.meta.env.PROD && !configuredApiBaseUrl) {
  throw new Error("Missing required VITE_API_BASE_URL for production builds.");
}

export const API_BASE_URL = (configuredApiBaseUrl || "http://localhost:4000").replace(/\/$/, "");

type AccessTokenProvider = () => Promise<string | null>;
type AuthMode = "bearer" | "body";

export class ApiClientError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? safeParseJson(text) : null;

  if (!response.ok) {
    const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const message =
      record
        ? typeof record.error === "string"
          ? record.error
          : typeof record.message === "string"
            ? record.message
            : response.statusText || "Request failed"
        : response.statusText || "Request failed";

    throw new ApiClientError(message, response.status);
  }

  return data as T;
}

export function createApiClient(getAccessToken: AccessTokenProvider) {
  async function request<T>(
    path: string,
    options: {
      authMode?: AuthMode;
      body?: object;
      method?: string;
      searchParams?: Record<string, string | number | null | undefined>;
      signal?: AbortSignal;
    } = {},
  ): Promise<T> {
    const { authMode = "bearer", body, method = "GET", searchParams, signal } = options;
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Unable to fetch a CDP access token.");
    }

    const url = new URL(`${API_BASE_URL}${path}`);

    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value !== null && value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers = new Headers();
    let requestBody: string | undefined;

    if (authMode === "bearer") {
      headers.set("Authorization", `Bearer ${token}`);
      if (body) {
        headers.set("Content-Type", "application/json");
        requestBody = JSON.stringify(body);
      }
    } else {
      headers.set("Content-Type", "application/json");
      requestBody = JSON.stringify({
        accessToken: token,
        ...body,
      });
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: requestBody,
      signal,
    });

    return readJsonResponse<T>(response);
  }

  return {
    bootstrapSession(signal?: AbortSignal) {
      return request<SessionBootstrapResponse>("/api/auth/session", {
        authMode: "body",
        method: "POST",
        signal,
      });
    },
    submitOnboarding(payload: OnboardingPayload, signal?: AbortSignal) {
      return request<SessionBootstrapResponse>("/api/onboarding", {
        authMode: "body",
        method: "POST",
        body: payload,
        signal,
      });
    },
    syncBridgeStatus(signal?: AbortSignal) {
      return request<BridgeStatusResponse>("/api/bridge/status", {
        authMode: "body",
        method: "POST",
        signal,
      });
    },
    saveSolanaAddress(solanaAddress: string, signal?: AbortSignal) {
      return request<{ user: BridgeStatusResponse["user"] }>("/api/users/solana-address", {
        authMode: "body",
        method: "POST",
        body: { solanaAddress },
        signal,
      });
    },
    fetchSolanaBalances(signal?: AbortSignal) {
      return request<SolanaBalancesResponse>("/api/users/balances", {
        method: "GET",
        signal,
      });
    },
    fetchSolanaTransactionContext(
      payload: FetchSolanaTransactionContextPayload,
      signal?: AbortSignal,
    ) {
      return request<SolanaTransactionContextResponse>("/api/users/solana-transaction-context", {
        authMode: "body",
        method: "POST",
        body: payload,
        signal,
      });
    },
    fetchRecipients(signal?: AbortSignal) {
      return request<RecipientListResponse>("/api/recipients", {
        method: "GET",
        signal,
      });
    },
    createRecipient(payload: CreateRecipientPayload, signal?: AbortSignal) {
      return request<{ recipient: Recipient }>("/api/recipients", {
        authMode: "body",
        method: "POST",
        body: payload,
        signal,
      });
    },
    createOnramp(payload: CreateOnrampPayload, signal?: AbortSignal) {
      return request<{ transaction: TransactionListResponse["transactions"][number] }>("/api/onramp", {
        authMode: "body",
        method: "POST",
        body: payload,
        signal,
      });
    },
    createOfframp(payload: CreateOfframpPayload, signal?: AbortSignal) {
      return request<{ transaction: TransactionListResponse["transactions"][number] }>("/api/offramp", {
        authMode: "body",
        method: "POST",
        body: payload,
        signal,
      });
    },
    fetchSwapOrder(payload: CreateSwapOrderPayload, signal?: AbortSignal) {
      return request<SwapOrderResponse>("/api/swaps/order", {
        authMode: "body",
        method: "POST",
        body: payload,
        signal,
      });
    },
    executeSwap(payload: ExecuteSwapPayload, signal?: AbortSignal) {
      return request<SwapExecuteResponse>("/api/swaps/execute", {
        authMode: "body",
        method: "POST",
        body: payload,
        signal,
      });
    },
    async deleteRecipient(recipientId: number, signal?: AbortSignal) {
      await request<void>(`/api/recipients/${recipientId}`, {
        method: "DELETE",
        signal,
      });
    },
    fetchTransactions(
      options: {
        cursor?: string | null;
        limit?: number;
      } = {},
      signal?: AbortSignal,
    ) {
      return request<TransactionListResponse>("/api/transactions", {
        method: "GET",
        searchParams: {
          cursor: options.cursor,
          limit: options.limit,
        },
        signal,
      });
    },
    fetchTransactionStreamToken(signal?: AbortSignal) {
      return request<StreamTokenResponse>("/api/transactions/stream-token", {
        method: "POST",
        signal,
      });
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
