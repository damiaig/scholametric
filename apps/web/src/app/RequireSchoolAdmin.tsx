import { Navigate, Outlet } from "react-router-dom";
import { Spinner } from "../components/ui/spinner";
import { useCurrentUser } from "../features/shell/use-current-user";
import { isSchoolAdmin } from "../lib/roles";

// Route guard for PROPRIETOR/SCHOOL_ADMIN-only pages (currently /personnel).
// Loading-aware, not just "falsy -> redirect" — redirecting while the role
// is still unknown would bounce legitimate admins before /auth/me resolves
// (same bug class as SettingsLayout's gate, docs/DECISIONS.md).
export function RequireSchoolAdmin() {
  const currentUser = useCurrentUser();

  if (currentUser.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading…
      </div>
    );
  }

  if (!isSchoolAdmin(currentUser.data?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
