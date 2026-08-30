import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, type ChangePasswordInput } from "@scholametric/shared";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { FieldError } from "../../components/FieldError";
import { getErrorMessage } from "../../lib/api-client";
import { useChangePassword } from "./use-change-password";

// v0.6 step 6 (SPEC_V0.6.md §5 step 6) — a VOLUNTARY entry point to the
// SAME POST /auth/change-password already used by the forced flow
// (ChangePasswordPage.tsx). Reuses useChangePassword() unchanged (no new
// backend behavior); a separate page rather than reusing that full-screen
// component because the two contexts differ structurally — forced is a
// takeover with no way out until done, this is an ordinary in-app settings
// page (AppShell chrome, a Back button, stays put on success instead of
// redirecting) — same reasoning as this codebase's other "two shapes for
// two resolutions" routes rather than one shared surface with a flag.
export function AccountChangePasswordPage() {
  const navigate = useNavigate();
  const changePassword = useChangePassword();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  const onSubmit = handleSubmit((values) => {
    changePassword.mutate(values, {
      onSuccess: () => reset({ currentPassword: "", newPassword: "" }),
    });
  });

  return (
    <div>
      <Button type="button" variant="outline" size="sm" className="mb-4" onClick={() => navigate(-1)}>
        Back
      </Button>

      <PageHeader title="Change password" />

      <Card className="max-w-sm">
        <CardContent className="pt-6">
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
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                aria-describedby="newPassword-hint"
                {...register("newPassword")}
              />
              <p id="newPassword-hint" className="text-xs text-muted">
                At least 8 characters.
              </p>
              <FieldError message={errors.newPassword?.message} />
            </div>

            {changePassword.isError && (
              <p role="alert" className="text-sm text-danger">
                {getErrorMessage(changePassword.error)}
              </p>
            )}

            {changePassword.isSuccess && (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Password changed.
              </p>
            )}

            <Button type="submit" className="mt-2" disabled={changePassword.isPending}>
              {changePassword.isPending && <Spinner className="mr-2" />}
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
