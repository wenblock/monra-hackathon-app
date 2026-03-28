import { useCurrentUser, useIsInitialized, useIsSignedIn } from "@coinbase/cdp-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Outlet } from "@tanstack/react-router";
import { Suspense, useEffect, useState } from "react";

import { buildBridgeStateFromUser } from "@/api";
import { lazyWithChunkRetry } from "@/lib/lazy-with-chunk-retry";
import { useAppSignOut } from "@/features/session/use-app-sign-out";
import { SessionProvider } from "@/features/session/session-context";
import { useSessionBootstrap } from "@/features/session/use-session-bootstrap";
import { useSubmitOnboardingMutation } from "@/features/session/use-session-mutations";
import { TransactionStreamProvider } from "@/features/transactions/transaction-stream-provider";
import Loading from "@/Loading";

const LazyOnboardingScreen = lazyWithChunkRetry(
  () => import("@/OnboardingScreen"),
  "onboarding-screen",
);
const LazySignInScreen = lazyWithChunkRetry(
  () => import("@/SignInScreen"),
  "sign-in-screen",
);

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
  const { signOut } = useAppSignOut();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<AppPhase>("initializing_cdp");
  const [error, setError] = useState<string | undefined>(undefined);
  const sessionBootstrapQuery = useSessionBootstrap({
    enabled: isInitialized && isSignedIn && Boolean(currentUser?.userId),
    userId: currentUser?.userId,
  });
  const submitOnboardingMutation = useSubmitOnboardingMutation(currentUser?.userId ?? "anonymous");

  useEffect(() => {
    if (!isInitialized) {
      setPhase("initializing_cdp");
      return;
    }

    if (!isSignedIn) {
      queryClient.clear();
      setPhase("unauthenticated");
      return;
    }

    if (!currentUser?.userId || sessionBootstrapQuery.isPending) {
      setError(undefined);
      setPhase("checking_backend_user");
      return;
    }

    if (sessionBootstrapQuery.isError) {
      setError(
        sessionBootstrapQuery.error instanceof Error
          ? sessionBootstrapQuery.error.message
          : "Unable to verify your account right now.",
      );
      setPhase("unauthenticated");
      return;
    }

    if (!sessionBootstrapQuery.data) {
      setPhase("checking_backend_user");
      return;
    }

    setError(undefined);
    setPhase(
      sessionBootstrapQuery.data.status === "needs_onboarding" ? "onboarding" : "ready",
    );
  }, [
    currentUser?.userId,
    isInitialized,
    isSignedIn,
    queryClient,
    sessionBootstrapQuery.data,
    sessionBootstrapQuery.error,
    sessionBootstrapQuery.isError,
    sessionBootstrapQuery.isPending,
  ]);

  useEffect(() => {
    if (!isSignedIn || !sessionBootstrapQuery.isError) {
      return;
    }
    void signOut().catch(() => undefined);
  }, [isSignedIn, sessionBootstrapQuery.isError, signOut]);

  useEffect(() => {
    if (phase !== "ready" && phase !== "onboarding") {
      submitOnboardingMutation.reset();
    }
  }, [phase, submitOnboardingMutation]);

  const session = sessionBootstrapQuery.data;

  if (!isInitialized) {
    return <Loading />;
  }

  if (!isSignedIn) {
    return (
      <Suspense fallback={<Loading label="Loading sign-in..." />}>
        <LazySignInScreen error={error} />
      </Suspense>
    );
  }

  if (!currentUser?.userId || sessionBootstrapQuery.isPending) {
    return <Loading label="Checking your Monra account..." />;
  }

  if (!session) {
    return (
      <Suspense fallback={<Loading label="Loading sign-in..." />}>
        <LazySignInScreen error={error} />
      </Suspense>
    );
  }

  if (session.status === "needs_onboarding") {
    return (
      <Suspense fallback={<Loading label="Loading onboarding..." />}>
        <LazyOnboardingScreen
          identity={session.identity}
          isSubmitting={submitOnboardingMutation.isPending}
          error={
            submitOnboardingMutation.error instanceof Error
              ? submitOnboardingMutation.error.message
              : undefined
          }
          onSubmit={async payload => {
            await submitOnboardingMutation.mutateAsync(payload);
          }}
        />
      </Suspense>
    );
  }

  if (!session.user) {
    return (
      <Suspense fallback={<Loading label="Loading sign-in..." />}>
        <LazySignInScreen error="Unable to load your Monra account." />
      </Suspense>
    );
  }

  return (
    <SessionProvider
      value={{
        identity: session.identity,
        user: session.user,
        bridge: session.bridge ?? buildBridgeStateFromUser(session.user),
      }}
    >
      <TransactionStreamProvider userId={session.user.cdpUserId}>
        <Outlet />
      </TransactionStreamProvider>
    </SessionProvider>
  );
}

export default App;
