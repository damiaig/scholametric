import { PageHeader } from "../../components/PageHeader";
import { Card, CardContent } from "../../components/ui/card";
import { useCurrentUser } from "../shell/use-current-user";

// v0.6 step 2 (SPEC_V0.6.md §5 step 2): a STUDENT/PARENT portal account can
// now log in, but their read views (published grades/report cards) are
// steps 3-4 — this is a deliberate placeholder, not a cut corner, and
// makes no backend calls of its own (nothing to show yet).
export function PortalHome() {
  const { data: user } = useCurrentUser();

  return (
    <div>
      <PageHeader title={`Welcome, ${user?.firstName ?? ""}`} description={user?.school.name} />
      <Card>
        <CardContent className="p-6 text-sm text-muted">
          <p>Your results and report cards will appear here soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
