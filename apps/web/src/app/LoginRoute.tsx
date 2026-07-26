import { Navigate } from "react-router-dom";
import { useIsAuthenticated } from "../lib/auth-store";
import { LoginPage } from "../features/auth/LoginPage";

/**
 * Redirects an already-authenticated user away from /login instead of
 * showing the form again. Always to /dashboard, even if they're still
 * flagged (rare: e.g. navigating back to /login while logged in) —
 * ProtectedLayout's own loading-aware gate catches that case and redirects
 * on to /change-password before any dashboard content ever renders, so
 * this doesn't need to duplicate that check.
 */
export function LoginRoute() {
  const isAuthenticated = useIsAuthenticated();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LoginPage />;
}
