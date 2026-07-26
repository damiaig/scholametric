import { Navigate } from "react-router-dom";
import { Spinner } from "../components/ui/spinner";
import { useIsAuthenticated } from "../lib/auth-store";
import { useCurrentUser } from "../features/shell/use-current-user";
import { ChangePasswordPage } from "../features/auth/ChangePasswordPage";

// Guards /change-password: unauthenticated -> /login; not (or no longer)
// flagged -> /dashboard (resolution 6 — no deep-link memory in v0.3, always
// home); loading-aware in between so neither redirect flashes before
// /auth/me resolves. Mirrors LoginRoute.tsx / RequireSchoolAdmin.tsx.
export function ChangePasswordRoute() {
  const isAuthenticated = useIsAuthenticated();
  const currentUser = useCurrentUser();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (currentUser.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!currentUser.data?.mustChangePassword) {
    return <Navigate to="/dashboard" replace />;
  }

  return <ChangePasswordPage />;
}
