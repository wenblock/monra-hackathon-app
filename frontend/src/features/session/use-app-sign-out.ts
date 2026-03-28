import { logOutEndUser } from "@coinbase/cdp-api-client";
import { useSignOut } from "@coinbase/cdp-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { CDP_CONFIG } from "@/config";
import { logRuntimeError } from "@/lib/log-runtime-error";

let signOutPromise: Promise<void> | null = null;

function useAppSignOut() {
  const { signOut: clearCdpSession } = useSignOut();
  const queryClient = useQueryClient();

  const signOut = useCallback(() => {
    if (signOutPromise) {
      return signOutPromise;
    }

    signOutPromise = (async () => {
      try {
        await logOutEndUser(CDP_CONFIG.projectId, {});
      } catch (error) {
        logRuntimeError("Unable to revoke Coinbase embedded wallet session.", error);
      }

      try {
        await clearCdpSession();
      } catch (error) {
        logRuntimeError("Unable to clear Coinbase embedded wallet state.", error);
      } finally {
        queryClient.clear();
      }
    })().finally(() => {
      signOutPromise = null;
    });

    return signOutPromise;
  }, [clearCdpSession, queryClient]);

  return { signOut };
}

export { useAppSignOut };
