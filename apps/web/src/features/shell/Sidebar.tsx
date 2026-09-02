import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, UserCog, Layers, IdCard, Settings, GraduationCap, CircleHelp } from "lucide-react";
import { cn } from "../../lib/utils";
import { isSchoolAdmin } from "../../lib/roles";
import { useCurrentUser } from "./use-current-user";
import { UserMenu } from "./UserMenu";

// v0.2 (SPEC_V0.2.md §4): Dashboard / Students / Teachers / Classes /
// Personnel / Settings. Teachers and Classes are visible to everyone
// (TEACHER gets read-only views server-side); Personnel and Settings are
// PROPRIETOR/SCHOOL_ADMIN only — absent from nav for TEACHER, not disabled,
// same convention as every other role-gated nav item in this app.
// Help (SPEC_V0.5.1.md §2.7, v0.5.1 step 6) is visible to everyone too —
// HelpPage itself branches its content by role, same pattern as /dashboard.
const BASE_NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/students", label: "Students", icon: Users },
  { to: "/teachers", label: "Teachers", icon: UserCog },
  { to: "/classes", label: "Classes", icon: Layers },
  { to: "/help", label: "Help", icon: CircleHelp },
];

const PERSONNEL_ITEM = { to: "/personnel", label: "Personnel", icon: IdCard };
const SETTINGS_ITEM = { to: "/settings/school", label: "Settings", icon: Settings };

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { data: user, isLoading, isError } = useCurrentUser();
  // v0.6 step 2: STUDENT/PARENT portal accounts only have their own
  // dashboard (StudentDashboard.tsx/ParentDashboard.tsx, via
  // DashboardPage.tsx) and no access to
  // Students/Teachers/Classes at all — those routes hit staff/admin-only
  // endpoints, so leaving them visible would be a dead-end 403 click, not
  // a placeholder. Help stays visible; its content mismatch for these
  // roles is deferred to v0.6 step 6 (per-role guide additions).
  const isPortalAccount = user?.role === "STUDENT" || user?.role === "PARENT";
  // TEACHER (SPEC_V0.3.md §4 item 2): same /dashboard route, different
  // label — that route renders "My Classes" instead of the admin dashboard
  // for this role (DashboardPage.tsx).
  const baseItems = isPortalAccount
    ? BASE_NAV_ITEMS.filter((item) => item.to === "/dashboard" || item.to === "/help")
    : user?.role === "TEACHER"
      ? BASE_NAV_ITEMS.map((item) => (item.to === "/dashboard" ? { ...item, label: "My Classes" } : item))
      : BASE_NAV_ITEMS;
  const navItems = isSchoolAdmin(user?.role) ? [...baseItems, PERSONNEL_ITEM, SETTINGS_ITEM] : baseItems;

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center gap-2 px-2">
        <GraduationCap className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        {isLoading ? (
          <span className="h-4 w-28 animate-pulse rounded bg-muted/20" aria-label="Loading school name" />
        ) : isError ? (
          <span className="text-sm text-muted">Unknown school</span>
        ) : (
          <span className="truncate text-sm font-semibold text-text">{user?.school.name}</span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                isActive ? "bg-primary/10 text-primary" : "text-text hover:bg-background",
              )
            }
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <UserMenu user={user} isLoading={isLoading} />
    </div>
  );
}
