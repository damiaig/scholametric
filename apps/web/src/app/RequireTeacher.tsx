import { Navigate, Outlet } from "react-router-dom";
import { Spinner } from "../components/ui/spinner";
import { useCurrentUser } from "../features/shell/use-current-user";
import { isTeacher } from "../lib/roles";

// v0.7.2 — route guard for TEACHER-only pages (currently /grades, the
// pick-a-class landing page). Mirrors RequireSchoolAdmin's shape exactly:
// loading-aware, not just "falsy -> redirect" — redirecting while the role
// is still unknown would bounce a legitimate teacher before /auth/me
// resolves (same bug class as SettingsLayout's gate, docs/DECISIONS.md).
export function RequireTeacher() {
  const currentUser = useCurrentUser();

  if (currentUser.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading…
      </div>
    );
  }

  if (!isTeacher(currentUser.data?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
