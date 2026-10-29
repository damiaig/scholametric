import { useSyncExternalStore } from "react";

// Memory-only, module-level auth state — deliberately not localStorage/
// sessionStorage (never a persistent, XSS-exfiltratable credential) and not
// React Context (so non-component code, e.g. the API client, can read/write
// it too).
//
// v0.8.5 step 1 (SPEC_V0.8.5.md §2) — the refresh token is GONE from this
// store entirely: it lives only in the httpOnly cookie set by the backend,
// invisible to JS. Only the access token is held here now. A page reload
// still always starts logged out for now — this store has no way to ask
// the cookie for a fresh access token on boot; that's step 3's silent-
// refresh-on-boot work, not this one. See docs/DECISIONS.md.
export interface AuthTokens {
  accessToken: string;
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
