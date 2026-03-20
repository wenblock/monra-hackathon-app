import { createContext, type ReactNode } from "react";

import type { AppUser, AuthIdentity, BridgeComplianceState } from "@/types";

interface SessionContextValue {
  bridge: BridgeComplianceState;
  identity: AuthIdentity;
  user: AppUser;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function SessionProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: SessionContextValue;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export { SessionContext, SessionProvider };
