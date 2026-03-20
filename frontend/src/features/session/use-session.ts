import { useContext } from "react";

import { SessionContext } from "@/features/session/session-context";

function useSession() {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error("useSession must be used within a SessionProvider.");
  }

  return value;
}

export { useSession };
