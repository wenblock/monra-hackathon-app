import {
  useCurrentUser,
  useGetAccessToken,
  useIsInitialized,
  useIsSignedIn,
  useSignOut,
} from "@coinbase/cdp-hooks";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  API_BASE_URL,
  bootstrapSession,
  createOnramp,
  createRecipient,
  deleteRecipient,
  fetchRecipients,
  fetchSolanaBalances,
  fetchSolanaTransactionContext,
  fetchTransactionStreamToken,
  fetchTransactions,
  saveSolanaAddress,
  submitOnboarding,
  syncBridgeStatus,
} from "./api";
import Dashboard from "./Dashboard";
import Loading from "./Loading";
import OnboardingScreen from "./OnboardingScreen";
import RecipientsPage from "./RecipientsPage";
import { navigateTo, usePathname } from "./router";
import SignInScreen from "./SignInScreen";
import TransactionsPage from "./TransactionsPage";
import type {
  AppTransaction,
  AppUser,
  AuthIdentity,
  BridgeComplianceState,
  CreateOnrampPayload,
  CreateRecipientPayload,
  FetchSolanaTransactionContextPayload,
  OnboardingPayload,
  Recipient,
  SolanaBalancesResponse,
  SolanaTransactionContextResponse,
  TransactionStreamResponse,
} from "./types";

type AppPhase =
  | "initializing_cdp"
  | "checking_backend_user"
  | "unauthenticated"
  | "onboarding"
  | "ready";

function App() {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { currentUser } = useCurrentUser();
  const { getAccessToken } = useGetAccessToken();
  const { signOut } = useSignOut();
  const [phase, setPhase] = useState<AppPhase>("initializing_cdp");
  const [user, setUser] = useState<AppUser | null>(null);
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [bridge, setBridge] = useState<BridgeComplianceState | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [balances, setBalances] = useState<SolanaBalancesResponse["balances"] | undefined>(undefined);
  const [isRecipientsLoading, setIsRecipientsLoading] = useState(false);
  const [recipientsError, setRecipientsError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<AppTransaction[]>([]);
  const [isTransactionsLoading, setIsTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isSubmittingOnboarding, setIsSubmittingOnboarding] = useState(false);
  const bootstrappedUserId = useRef<string | null>(null);
  const streamReconnectAttempts = useRef(0);
  const streamOutageStartedAt = useRef<number | null>(null);
  const hasOpenedTransactionStream = useRef(false);
  const pathname = usePathname();

  const refreshDashboardData = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Unable to fetch a CDP access token.");
    }

    const [balancesResponse, transactionsResponse, recipientsResponse] = await Promise.all([
      fetchSolanaBalances(token),
      fetchTransactions(token, { limit: 5 }),
      fetchRecipients(token),
    ]);

    setBalances(balancesResponse.balances);
    setTransactions(transactionsResponse.transactions);
    setTransactionsError(null);
    setRecipients(recipientsResponse.recipients);
    setRecipientsError(null);
  }, [getAccessToken]);

  useEffect(() => {
    if (!isInitialized) {
      setPhase("initializing_cdp");
      return;
    }

    if (!isSignedIn) {
      bootstrappedUserId.current = null;
      setUser(null);
      setIdentity(null);
      setBridge(null);
      setRecipients([]);
      setBalances(undefined);
      setRecipientsError(null);
      setTransactions([]);
      setTransactionsError(null);
      streamReconnectAttempts.current = 0;
      streamOutageStartedAt.current = null;
      hasOpenedTransactionStream.current = false;
      setPhase("unauthenticated");
      return;
    }

    if (!currentUser?.userId || bootstrappedUserId.current === currentUser.userId) {
      return;
    }

    let isCancelled = false;

    const syncUser = async () => {
      try {
        setError(undefined);
        setPhase("checking_backend_user");

        const token = await getAccessToken();
        if (!token) {
          throw new Error("Unable to fetch a CDP access token.");
        }

        const response = await bootstrapSession(token);
        if (isCancelled) {
          return;
        }

        bootstrappedUserId.current = response.identity.cdpUserId;
        setIdentity(response.identity);

        if (response.status === "needs_onboarding") {
          setBridge(null);
          setUser(null);
          setRecipients([]);
          setBalances(undefined);
          setRecipientsError(null);
          setTransactions([]);
          setTransactionsError(null);
          streamReconnectAttempts.current = 0;
          streamOutageStartedAt.current = null;
          hasOpenedTransactionStream.current = false;
          setPhase("onboarding");
          return;
        }

        setBridge(response.bridge);
        setUser(response.user);
        setPhase("ready");
      } catch (bootstrapError) {
        if (isCancelled) {
          return;
        }

        bootstrappedUserId.current = null;
        setUser(null);
        setIdentity(null);
        setBridge(null);
        setRecipients([]);
        setBalances(undefined);
        setRecipientsError(null);
        setTransactions([]);
        setTransactionsError(null);
        streamReconnectAttempts.current = 0;
        streamOutageStartedAt.current = null;
        hasOpenedTransactionStream.current = false;
        setError(
          bootstrapError instanceof Error
            ? bootstrapError.message
            : "Unable to verify your account right now.",
        );
        await signOut().catch(() => undefined);
        setPhase("unauthenticated");
      }
    };

    void syncUser();

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.userId, getAccessToken, isInitialized, isSignedIn, signOut]);

  useEffect(() => {
    if (phase !== "ready" || !user) {
      setRecipients([]);
      setBalances(undefined);
      setRecipientsError(null);
      setIsRecipientsLoading(false);
      setTransactions([]);
      setTransactionsError(null);
      setIsTransactionsLoading(false);
      return;
    }

    let cancelled = false;

    const loadData = async () => {
      try {
        setIsRecipientsLoading(true);
        setIsTransactionsLoading(true);
        await refreshDashboardData();
      } catch (loadError) {
        if (!cancelled) {
          const message =
            loadError instanceof Error ? loadError.message : "Unable to load account data right now.";
          setRecipientsError(message);
          setTransactionsError(message);
        }
      } finally {
        if (!cancelled) {
          setIsRecipientsLoading(false);
          setIsTransactionsLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [phase, refreshDashboardData, user]);

  useEffect(() => {
    if (phase !== "ready" || !user) {
      return;
    }

    let cancelled = false;
    let activeStream: EventSource | null = null;
    let reconnectTimer: number | null = null;

    streamReconnectAttempts.current = 0;
    streamOutageStartedAt.current = null;
    hasOpenedTransactionStream.current = false;

    const scheduleReconnect = () => {
      if (cancelled) {
        return;
      }

      const outageStartedAt = streamOutageStartedAt.current;
      const outageDuration = outageStartedAt === null ? 0 : Date.now() - outageStartedAt;

      if (streamReconnectAttempts.current >= 3 || outageDuration >= 30000) {
        setTransactionsError("Live updates are temporarily unavailable. Reconnecting...");
      }

      reconnectTimer = window.setTimeout(() => {
        void connect();
      }, 3000);
    };

    const connect = async () => {
      try {
        const token = await getAccessToken();
        if (!token || cancelled) {
          return;
        }

        const streamTokenResponse = await fetchTransactionStreamToken(token);
        if (cancelled) {
          return;
        }

        const streamUrl = new URL(`${API_BASE_URL}/api/transactions/stream`);
        streamUrl.searchParams.set("streamToken", streamTokenResponse.token);

        const stream = new EventSource(streamUrl.toString());
        activeStream = stream;

        stream.onopen = () => {
          const shouldRefreshSnapshot =
            hasOpenedTransactionStream.current ||
            streamReconnectAttempts.current > 0 ||
            streamOutageStartedAt.current !== null;

          hasOpenedTransactionStream.current = true;
          streamReconnectAttempts.current = 0;
          streamOutageStartedAt.current = null;
          setTransactionsError(null);

          if (shouldRefreshSnapshot) {
            void refreshDashboardData().catch(console.error);
          }
        };

        stream.onmessage = event => {
          try {
            const payload = JSON.parse(event.data) as TransactionStreamResponse;
            setBalances(payload.balances);
            setTransactions(payload.transactions);
            setTransactionsError(null);
          } catch (streamError) {
            console.error(streamError);
          }
        };

        stream.onerror = () => {
          if (activeStream !== stream) {
            return;
          }

          stream.close();
          activeStream = null;

          if (cancelled) {
            return;
          }

          streamReconnectAttempts.current += 1;
          streamOutageStartedAt.current ??= Date.now();
          scheduleReconnect();
        };
      } catch (streamError) {
        console.error(streamError);

        if (cancelled) {
          return;
        }

        streamReconnectAttempts.current += 1;
        streamOutageStartedAt.current ??= Date.now();
        scheduleReconnect();
      }
    };

    void connect();

    return () => {
      cancelled = true;

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }

      activeStream?.close();
    };
  }, [getAccessToken, phase, user]);

  useEffect(() => {
    if (phase !== "ready") {
      return;
    }

    if (pathname !== "/" && pathname !== "/recipients" && pathname !== "/transactions") {
      navigateTo("/");
    }
  }, [pathname, phase]);

  const handleOnboardingSubmit = async (payload: OnboardingPayload) => {
    setIsSubmittingOnboarding(true);
    setError(undefined);

    try {
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Unable to fetch a CDP access token.");
      }

      const response = await submitOnboarding(token, payload);
      setIdentity(response.identity);
      setBridge(response.bridge);
      setUser(response.user);
      setPhase("ready");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unable to save onboarding details.",
      );
    } finally {
      setIsSubmittingOnboarding(false);
    }
  };

  const handleBridgeStatusRefresh = async () => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Unable to fetch a CDP access token.");
    }

    const response = await syncBridgeStatus(token);
    setBridge(response.bridge);
    setUser(response.user);
  };

  const handleSolanaAddressPersist = async (solanaAddress: string) => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Unable to fetch a CDP access token.");
    }

    const response = await saveSolanaAddress(token, solanaAddress);
    setUser(response.user);
  };

  const handleSolanaTransactionContextFetch = async (
    payload: FetchSolanaTransactionContextPayload,
  ): Promise<SolanaTransactionContextResponse> => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Unable to fetch a CDP access token.");
    }

    return fetchSolanaTransactionContext(token, payload);
  };

  const handleRecipientCreate = async (payload: CreateRecipientPayload) => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Unable to fetch a CDP access token.");
    }

    const response = await createRecipient(token, payload);
    setRecipients(currentRecipients => [response.recipient, ...currentRecipients]);
    setRecipientsError(null);
    return response.recipient;
  };

  const handleOnrampCreate = async (payload: CreateOnrampPayload) => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Unable to fetch a CDP access token.");
    }

    const response = await createOnramp(token, payload);
    setTransactions(currentTransactions => [
      response.transaction,
      ...currentTransactions.filter(transaction => transaction.id !== response.transaction.id),
    ]);
    setTransactionsError(null);
    return response.transaction;
  };

  const handleRecipientDelete = async (recipientId: number) => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Unable to fetch a CDP access token.");
    }

    await deleteRecipient(token, recipientId);
    setRecipients(currentRecipients =>
      currentRecipients.filter(recipient => recipient.id !== recipientId),
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {phase === "initializing_cdp" && <Loading />}
      {phase === "checking_backend_user" && <Loading label="Checking your Monra account..." />}
      {phase === "unauthenticated" && <SignInScreen error={error} />}
      {phase === "onboarding" && identity && (
        <OnboardingScreen
          identity={identity}
          isSubmitting={isSubmittingOnboarding}
          error={error}
          onSubmit={handleOnboardingSubmit}
        />
      )}
      {phase === "ready" && user && (
        <>
          {pathname === "/recipients" ? (
            <RecipientsPage
              isLoading={isRecipientsLoading}
              loadError={recipientsError}
              onCreateRecipient={handleRecipientCreate}
              onDeleteRecipient={handleRecipientDelete}
              recipients={recipients}
            />
          ) : pathname === "/transactions" ? (
            <TransactionsPage />
          ) : (
            <Dashboard
              balances={balances}
              bridge={bridge ?? buildBridgeStateFromUser(user)}
              onCreateOnramp={handleOnrampCreate}
              onCreateWalletRecipient={handleRecipientCreate}
              onFetchSolanaTransactionContext={handleSolanaTransactionContextFetch}
              onPersistSolanaAddress={handleSolanaAddressPersist}
              onRefreshBridgeStatus={handleBridgeStatusRefresh}
              recipients={recipients}
              transactions={transactions}
              transactionsError={transactionsError}
              transactionsLoading={isTransactionsLoading}
              user={user}
            />
          )}
        </>
      )}
    </div>
  );
}

function buildBridgeStateFromUser(user: AppUser): BridgeComplianceState {
  const hasAcceptedTermsOfService = user.bridgeTosStatus === "approved";

  return {
    customerStatus: user.bridgeKycStatus,
    hasAcceptedTermsOfService,
    showKycAlert: Boolean(user.bridgeKycLink && user.bridgeKycStatus !== "active"),
    showTosAlert: Boolean(user.bridgeTosLink && !hasAcceptedTermsOfService),
  };
}

export default App;
