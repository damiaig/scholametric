import { useSyncExternalStore } from "react";

// Memory-only, module-level auth state — deliberately not localStorage/
// sessionStorage (never a persistent, XSS-exfiltratable credential) and not
// React Context (so non-component code, e.g. the API client, can read/write
// it too).
//
// v0.8.5 step 1 (SPEC_V0.8.5.md §2) — the refresh token is GONE from this
// store entirely: it lives only in the httpOnly cookie set by the backend,
// invisible to JS. Only the access token is held here now.
//
// v0.8.5 step 3 (SPEC_V0.8.5.md §3) — boot rehydration. `status` starts
// `"unknown"` on every module load (every page load), not `"unauthenticated"`
// — there's a real difference between "confirmed no session" and "haven't
// asked the cookie yet," and collapsing them is exactly what caused the old
// reload-logs-you-out behavior. `AuthBootGate` (apps/web/src/app/
// AuthBootGate.tsx) is what asks: it fires the one boot `/auth/refresh` and
// resolves `status` to `"authenticated"` or `"unauthenticated"` once that
// settles. See docs/DECISIONS.md for the reversal of the 2026-07-13
// memory-only/no-rehydration decision.
export type AuthStatus = "unknown" | "authenticated" | "unauthenticated";

export interface AuthTokens {
  accessToken: string;
}

let status: AuthStatus = "unknown";
let accessToken: string | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

export const authStore = {
  getState: (): AuthTokens | null => (accessToken !== null ? { accessToken } : null),

  getStatus: (): AuthStatus => status,

  setTokens(tokens: AuthTokens): void {
    accessToken = tokens.accessToken;
    status = "authenticated";
    emitChange();
  },

  clear(): void {
    accessToken = null;
    status = "unauthenticated";
    emitChange();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/**
 * Test support only — the running app never calls this; `status` only
 * ever leaves `"unknown"` once per real page load. Exists because the
 * module-level state here persists across every `it()` in a test file, so
 * a test that specifically exercises the boot-time "unknown" window needs
 * a way back to it between cases.
 */
export function resetAuthStatusForTests(): void {
  status = "unknown";
  accessToken = null;
  emitChange();
}

/** Reactively reflects the full tri-state — used by AuthBootGate to gate rendering on boot. */
export function useAuthStatus(): AuthStatus {
  return useSyncExternalStore(authStore.subscribe, authStore.getStatus);
}

/**
 * Reactively reflects auth-store changes — used by route guards and the
 * shell. Collapses the tri-state to a boolean on purpose: every consumer of
 * this hook (LoginRoute, ChangePasswordRoute, ProtectedLayout, useCurrentUser)
 * only ever renders once AuthBootGate has already resolved "unknown" away —
 * see AuthBootGate.tsx — so they never need to tell "still booting" apart
 * from "confirmed logged out."
 */
export function useIsAuthenticated(): boolean {
  return useSyncExternalStore(authStore.subscribe, () => authStore.getStatus() === "authenticated");
}
