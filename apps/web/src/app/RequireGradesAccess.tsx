import { Navigate, Outlet } from "react-router-dom";
import { Spinner } from "../components/ui/spinner";
import { useCurrentUser } from "../features/shell/use-current-user";
import { isTeacher, isSchoolAdmin } from "../lib/roles";

// v0.7.2 step 2 (SPEC_V0.7.2.md §3) — route guard for the Grades landing
// page (/grades). Renamed from RequireTeacher: with the class page's
// grading UI removed (Item 3), SCHOOL_ADMIN/PROPRIETOR now ALSO reach
// grading exclusively through here, so a guard still called "RequireTeacher"
// would misname what it actually permits. Mirrors RequireSchoolAdmin's
// shape exactly: loading-aware, not just "falsy -> redirect" — redirecting
// while the role is still unknown would bounce a legitimate teacher/admin
// before /auth/me resolves (same bug class as SettingsLayout's gate,
// docs/DECISIONS.md).
export function RequireGradesAccess() {
  const currentUser = useCurrentUser();

  if (currentUser.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading…
      </div>
    );
  }

  if (
    !isTeacher(currentUser.data?.role) &&
    !isSchoolAdmin(currentUser.data?.role)
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
