import { Link } from "react-router-dom";
import { CalendarClock, UserX, CalendarCog } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { useCurrentUser } from "../shell/use-current-user";

const DESTINATIONS = [
  { to: "/timetable/build", label: "Build timetable", icon: CalendarClock },
  { to: "/timetable/absences", label: "Absences & cover", icon: UserX },
  { to: "/settings/calendar", label: "Calendar settings", icon: CalendarCog },
];

// v0.8.1 step 2 (SPEC_V0.8.1.md §2.7) — SCHOOL_ADMIN/PROPRIETOR's one
// grouped entry point for calendar management, reached via the sidebar's
// new "Timetable" item. Replaces the three separate dashboard cards
// (Build timetable / Absences & cover / Calendar settings) that used to
// live on the admin dashboard — same three destinations, same icons,
// moved here so all three get equal discoverability from one place
// instead of being buried among unrelated dashboard actions. Each
// destination is an existing, unchanged page/route; this is purely a new
// front door, not new functionality.
export function TimetableHubPage() {
  const { data: user } = useCurrentUser();

  return (
    <div>
      <PageHeader title="Timetable" description={user?.school.name} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DESTINATIONS.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className="block">
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="flex h-full items-center gap-4 p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="font-semibold text-text">{label} →</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
