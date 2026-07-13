import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput, type SchoolSearchResult } from "@scholametric/shared";
import { GraduationCap } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { SchoolPickerModal } from "./SchoolPickerModal";
import { useLogin } from "./use-login";

export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<SchoolSearchResult | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { schoolSlug: "", email: "", password: "" },
  });

  function handleSelectSchool(school: SchoolSearchResult) {
    setSelectedSchool(school);
    setValue("schoolSlug", school.slug, { shouldValidate: true });
  }

  const onSubmit = handleSubmit((values) => {
    login.mutate(values, {
      onSuccess: () => navigate("/dashboard"),
    });
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <GraduationCap className="mb-2 h-8 w-8 text-primary" aria-hidden="true" />
          <CardTitle>Sign in to ScholaMetric</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              {/* Not a <Label htmlFor>: an explicit label association would
                  override this button's accessible name with "School"
                  instead of the dynamic selected-school text. */}
              <span className="text-sm font-medium leading-none text-text">School</span>
              <Button type="button" variant="outline" className="justify-start font-normal" onClick={() => setPickerOpen(true)}>
                {selectedSchool ? selectedSchool.name : "Select your school"}
              </Button>
              <input type="hidden" {...register("schoolSlug")} />
              {errors.schoolSlug && <p className="text-xs text-danger">{errors.schoolSlug.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@school.test"
                {...register("email")}
              />
              {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
              {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
            </div>

            {login.isError && (
              <p role="alert" className="text-sm text-danger">
                {getErrorMessage(login.error)}
              </p>
            )}

            <Button type="submit" className="mt-2" disabled={login.isPending}>
              {login.isPending && <Spinner className="mr-2" />}
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>

      <SchoolPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handleSelectSchool} />
    </div>
  );
}
