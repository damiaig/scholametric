import { useCurrentUser } from "../shell/use-current-user";
import { Spinner } from "../../components/ui/spinner";

export function DashboardPage() {
  const { data: user, isLoading, isError } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading your dashboard…
      </div>
    );
  }

  if (isError || !user) {
    return <p className="text-sm text-danger">Couldn&apos;t load your profile. Please refresh the page.</p>;
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-text">Welcome back, {user.firstName}!</h1>
      <p className="mt-1 text-sm text-muted">{user.school.name}</p>
    </div>
  );
}
