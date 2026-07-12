import { useQuery } from "@tanstack/react-query";
import { GraduationCap, CircleCheck, CircleAlert, CircleDashed } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { fetchHealth } from "../../lib/api";

function ApiStatusBadge() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <CircleDashed className="h-3.5 w-3.5 animate-spin" />
        Checking API status…
      </span>
    );
  }

  const reachable = !isError && data?.status === "ok";

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        reachable ? "text-success" : "text-danger"
      }`}
    >
      {reachable ? (
        <CircleCheck className="h-3.5 w-3.5" />
      ) : (
        <CircleAlert className="h-3.5 w-3.5" />
      )}
      {reachable ? "API reachable" : "API unreachable"}
    </span>
  );
}

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <GraduationCap className="mb-2 h-8 w-8 text-primary" aria-hidden="true" />
          <CardTitle>Sign in to ScholaMetric</CardTitle>
          <ApiStatusBadge />
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="schoolSlug">School</Label>
              <Input id="schoolSlug" name="schoolSlug" placeholder="e.g. sunrise" autoComplete="organization" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@school.test" autoComplete="email" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" />
            </div>
            <Button type="submit" className="mt-2">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
