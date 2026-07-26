import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useIsAuthenticated } from "../lib/auth-store";
import { AppShell } from "../features/shell/AppShell";
import { Spinner } from "../components/ui/spinner";
import { useCurrentUser } from "../features/shell/use-current-user";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

export function ProtectedLayout() {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();
  const currentUser = useCurrentUser();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // SPEC_V0.3.md §4 item 4: enforced here too (not just server-side) so a
  // flagged user never sees a flash of any other page's content before the
  // redirect — loading-aware, same pattern as RequireSchoolAdmin.tsx.
  if (currentUser.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (currentUser.data?.mustChangePassword) {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <AppShell>
      {/* key=pathname: navigating to a different route remounts the
          boundary, so a crashed page doesn't stay stuck once the user
          moves on — only "Try again"/reload retry the SAME route. */}
      <RouteErrorBoundary key={location.pathname}>
        <Outlet />
      </RouteErrorBoundary>
    </AppShell>
  );
}
