import { useSyncExternalStore } from "react";

// Memory-only, module-level auth state — deliberately not localStorage/
// sessionStorage (never a persistent, XSS-exfiltratable credential) and not
// React Context (so non-component code, e.g. the API client, can read/write
// it too). A page reload always starts logged out; see docs/DECISIONS.md.
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

let state: AuthTokens | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

export const authStore = {
  getState: (): AuthTokens | null => state,

  setTokens(tokens: AuthTokens): void {
    state = tokens;
    emitChange();
  },

  clear(): void {
    state = null;
    emitChange();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Reactively reflects auth-store changes — used by route guards and the shell. */
export function useIsAuthenticated(): boolean {
  return useSyncExternalStore(authStore.subscribe, () => authStore.getState() !== null);
}
