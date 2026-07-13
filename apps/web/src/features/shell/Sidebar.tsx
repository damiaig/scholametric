import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, Settings, GraduationCap } from "lucide-react";
import { cn } from "../../lib/utils";
import { useCurrentUser } from "./use-current-user";
import { UserMenu } from "./UserMenu";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/students", label: "Students", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { data: user, isLoading, isError } = useCurrentUser();

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
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
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
