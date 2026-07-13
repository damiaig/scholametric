import { Navigate, Outlet } from "react-router-dom";
import { useIsAuthenticated } from "../lib/auth-store";
import { AppShell } from "../features/shell/AppShell";

export function ProtectedLayout() {
  const isAuthenticated = useIsAuthenticated();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
