import type {
  BridgeStatusResponse,
  CreateOfframpPayload,
  CreateOnrampPayload,
  CreateRecipientPayload,
  FetchSolanaTransactionContextPayload,
  OnboardingPayload,
  Recipient,
  RecipientListResponse,
  SessionBootstrapResponse,
  SolanaBalancesResponse,
  SolanaTransactionContextResponse,
  StreamTokenResponse,
  TransactionListResponse,
} from "./types";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

if (import.meta.env.PROD && !configuredApiBaseUrl) {
  throw new Error("Missing required VITE_API_BASE_URL for production builds.");
}

export const API_BASE_URL = (configuredApiBaseUrl || "http://localhost:4000").replace(/\/$/, "");

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : "Request failed";
    throw new Error(message);
  }

  return data as T;
}

export async function bootstrapSession(token: string): Promise<SessionBootstrapResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accessToken: token,
    }),
  });

  return readJson<SessionBootstrapResponse>(response);
}

export async function submitOnboarding(token: string, payload: OnboardingPayload) {
  const response = await fetch(`${API_BASE_URL}/api/onboarding`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accessToken: token,
      ...payload,
    }),
  });

  return readJson<SessionBootstrapResponse>(response);
}

export async function syncBridgeStatus(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/bridge/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accessToken: token,
    }),
  });

  return readJson<BridgeStatusResponse>(response);
}

export async function saveSolanaAddress(token: string, solanaAddress: string) {
  const response = await fetch(`${API_BASE_URL}/api/users/solana-address`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accessToken: token,
      solanaAddress,
    }),
  });

  return readJson<{ user: BridgeStatusResponse["user"] }>(response);
}

export async function fetchSolanaBalances(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/users/balances`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return readJson<SolanaBalancesResponse>(response);
}

export async function fetchSolanaTransactionContext(
  token: string,
  payload: FetchSolanaTransactionContextPayload,
) {
  const response = await fetch(`${API_BASE_URL}/api/users/solana-transaction-context`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accessToken: token,
      ...payload,
    }),
  });

  return readJson<SolanaTransactionContextResponse>(response);
}

export async function fetchRecipients(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/recipients`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return readJson<RecipientListResponse>(response);
}

export async function createRecipient(token: string, payload: CreateRecipientPayload) {
  const response = await fetch(`${API_BASE_URL}/api/recipients`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accessToken: token,
      ...payload,
    }),
  });

  return readJson<{ recipient: Recipient }>(response);
}

export async function createOnramp(token: string, payload: CreateOnrampPayload) {
  const response = await fetch(`${API_BASE_URL}/api/onramp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accessToken: token,
      ...payload,
    }),
  });

  return readJson<{ transaction: TransactionListResponse["transactions"][number] }>(response);
}

export async function createOfframp(token: string, payload: CreateOfframpPayload) {
  const response = await fetch(`${API_BASE_URL}/api/offramp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accessToken: token,
      ...payload,
    }),
  });

  return readJson<{ transaction: TransactionListResponse["transactions"][number] }>(response);
}

export async function deleteRecipient(token: string, recipientId: number) {
  const response = await fetch(`${API_BASE_URL}/api/recipients/${recipientId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    await readJson(response);
  }
}

export async function fetchTransactions(
  token: string,
  options: {
    cursor?: string | null;
    limit?: number;
  } = {},
) {
  const url = new URL(`${API_BASE_URL}/api/transactions`);

  if (typeof options.limit === "number") {
    url.searchParams.set("limit", String(options.limit));
  }

  if (options.cursor) {
    url.searchParams.set("cursor", options.cursor);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return readJson<TransactionListResponse>(response);
}

export async function fetchTransactionStreamToken(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/transactions/stream-token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return readJson<StreamTokenResponse>(response);
}
