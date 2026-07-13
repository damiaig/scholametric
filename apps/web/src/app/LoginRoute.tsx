import { Navigate } from "react-router-dom";
import { useIsAuthenticated } from "../lib/auth-store";
import { LoginPage } from "../features/auth/LoginPage";

/** Redirects an already-authenticated user away from /login instead of showing the form again. */
export function LoginRoute() {
  const isAuthenticated = useIsAuthenticated();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <LoginPage />;
}
