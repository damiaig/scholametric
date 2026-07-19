import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useIsAuthenticated } from "../lib/auth-store";
import { AppShell } from "../features/shell/AppShell";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

export function ProtectedLayout() {
  const isAuthenticated = useIsAuthenticated();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
