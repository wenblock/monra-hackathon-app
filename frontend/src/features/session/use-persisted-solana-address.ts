import { useSolanaAddress } from "@coinbase/cdp-hooks";
import { useEffect, useRef, useState } from "react";

import { logRuntimeError } from "@/lib/log-runtime-error";

import { useSaveSolanaAddressMutation } from "./use-session-mutations";

function usePersistedSolanaAddress(userId: string, storedSolanaAddress: string | null) {
  const { solanaAddress } = useSolanaAddress();
  const saveSolanaAddressMutation = useSaveSolanaAddressMutation(userId);
  const attemptedAddressRef = useRef<string | null>(null);
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  useEffect(() => {
    if (!solanaAddress) {
      attemptedAddressRef.current = null;
      setPersistenceError(null);
      return;
    }

    if (storedSolanaAddress) {
      attemptedAddressRef.current = storedSolanaAddress;
      setPersistenceError(null);
      return;
    }

    if (attemptedAddressRef.current === solanaAddress) {
      return;
    }

    attemptedAddressRef.current = solanaAddress;
    setPersistenceError(null);

    void saveSolanaAddressMutation.mutateAsync(solanaAddress).catch(error => {
      logRuntimeError("Unable to persist Solana address.", error);
      attemptedAddressRef.current = null;
      setPersistenceError(
        "Your wallet address could not be synced to the backend yet. Refresh the page and try again if this persists.",
      );
    });
  }, [saveSolanaAddressMutation, solanaAddress, storedSolanaAddress]);

  return {
    effectiveSolanaAddress: storedSolanaAddress ?? solanaAddress ?? null,
    isPersistingSolanaAddress:
      Boolean(solanaAddress) && storedSolanaAddress === null && saveSolanaAddressMutation.isPending,
    persistenceError,
    storedSolanaAddress,
  };
}

export { usePersistedSolanaAddress };
