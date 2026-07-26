import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, type ChangePasswordInput } from "@scholametric/shared";
import { KeyRound } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { FieldError } from "../../components/FieldError";
import { getErrorMessage } from "../../lib/api-client";
import { useChangePassword } from "./use-change-password";

// Full-screen, no AppShell (no sidebar/nav) — a flagged user cannot reach
// any other route until this succeeds. ProtectedLayout/ChangePasswordRoute
// enforce that on the frontend; the API's PASSWORD_CHANGE_REQUIRED guard
// backs it server-side (docs/API.md).
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const changePassword = useChangePassword();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  const onSubmit = handleSubmit((values) => {
    changePassword.mutate(values, {
      onSuccess: () => navigate("/dashboard", { replace: true }),
    });
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <KeyRound className="mb-2 h-8 w-8 text-primary" aria-hidden="true" />
          <CardTitle>Choose your own password to continue</CardTitle>
          <p className="text-sm text-muted">
            For security, you need to set a new password before you can use ScholaMetric.
          </p>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...register("currentPassword")}
              />
              <FieldError message={errors.currentPassword?.message} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <Input id="newPassword" type="password" autoComplete="new-password" {...register("newPassword")} />
              <FieldError message={errors.newPassword?.message} />
            </div>

            {changePassword.isError && (
              <p role="alert" className="text-sm text-danger">
                {getErrorMessage(changePassword.error)}
              </p>
            )}

            <Button type="submit" className="mt-2" disabled={changePassword.isPending}>
              {changePassword.isPending && <Spinner className="mr-2" />}
              Set new password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
