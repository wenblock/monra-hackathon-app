import type { AppUser, AuthIdentity } from "./types.js";

declare global {
  namespace Express {
    interface Request {
      appUser?: AppUser;
      authIdentity?: AuthIdentity;
      requestId?: string;
    }
  }
}

export {};
