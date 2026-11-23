import { useCallback, useEffect, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "../components/ui/button";
import { Spinner } from "../components/ui/spinner";
import { authStore, useAuthStatus } from "../lib/auth-store";
import { ApiError, getErrorMessage, refreshTokens } from "../lib/api-client";

/**
 * v0.8.5 step 3 (SPEC_V0.8.5.md §3) — the reload fix. Wraps the entire
 * route tree (see App.tsx) so NOTHING protected and NOT /login renders
 * while status is "unknown": AppRoutes itself isn't instantiated yet, so
 * LoginRoute/ChangePasswordRoute/ProtectedLayout never get a chance to
 * render the wrong thing before the boot refresh settles — this is what
 * makes a reload with a valid cookie go splash -> app with no flash of the
 * login screen, rather than something each of those three had to be
 * individually taught to avoid.
 *
 * v0.9 Step 2c (docs/DECISIONS.md) — success moves status to
 * "authenticated"; a DEFINITIVE rejection (401 — no cookie, expired,
 * revoked) moves it to "unauthenticated", same as before. Anything else
 * (refreshTokens()'s own retryable 409/503 even after its one internal
 * retry, a network error, an unrelated 5xx) is the server/network being
 * transiently unavailable, not proof there's no session — `status` is
 * deliberately left at "unknown" (neither confirmed path), and a local
 * `bootError` state shows a minimal retry prompt instead of ever reaching
 * the login page for a reason that has nothing to do with the user's
 * actual session.
 */
export function AuthBootGate({ children }: { children: ReactNode }) {
  const status = useAuthStatus();
  const [bootError, setBootError] = useState<string | null>(null);

  const attemptBoot = useCallback(() => {
    setBootError(null);
    refreshTokens()
      .then((tokens) => authStore.setTokens(tokens))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          authStore.clear();
        } else {
          setBootError(getErrorMessage(error, "Couldn't reach the server. Please try again."));
        }
      });
  }, []);

  useEffect(() => {
    attemptBoot();
  }, [attemptBoot]);

  if (bootError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-center">
        <TriangleAlert className="h-8 w-8 text-danger" aria-hidden="true" />
        <p className="text-base font-medium text-text">Server busy</p>
        <p className="max-w-sm text-sm text-muted">{bootError}</p>
        <Button type="button" onClick={attemptBoot}>
          Retry
        </Button>
      </div>
    );
  }

  if (status === "unknown") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return <>{children}</>;
}
