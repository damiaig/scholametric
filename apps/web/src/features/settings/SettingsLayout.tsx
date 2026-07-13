import { NavLink, Navigate, Outlet } from "react-router-dom";
import { Spinner } from "../../components/ui/spinner";
import { useCurrentUser } from "../shell/use-current-user";

const TABS = [
  { to: "/settings/school", label: "Profile" },
  { to: "/settings/academic", label: "Academic" },
  { to: "/settings/users", label: "Users" },
];

export function SettingsLayout() {
  const currentUser = useCurrentUser();

  // Loading-aware, not just "falsy → redirect": redirecting while the role
  // is still unknown would bounce every user, including legitimate
  // SCHOOL_ADMINs, before /auth/me resolves (see docs/DECISIONS.md, the
  // same bug class as step 7's NewStudentPage fix).
  if (currentUser.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading…
      </div>
    );
  }

  if (currentUser.data?.role !== "SCHOOL_ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-text">Settings</h1>

      <div role="tablist" aria-label="Settings sections" className="mb-6 flex gap-1 border-b border-muted/20">
        {TABS.map((tabItem) => (
          <NavLink
            key={tabItem.to}
            to={tabItem.to}
            className={({ isActive }) =>
              isActive
                ? "border-b-2 border-primary px-3 py-2 text-sm font-medium text-primary"
                : "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted hover:text-text"
            }
          >
            {tabItem.label}
          </NavLink>
        ))}
      </div>

      <Outlet />
    </div>
  );
}
