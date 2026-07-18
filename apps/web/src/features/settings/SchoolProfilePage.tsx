import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { updateSchoolSchema, type CurrentUserSchool, type UpdateSchoolInput } from "@scholametric/shared";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { FieldError } from "../../components/FieldError";
import { getErrorMessage } from "../../lib/api-client";
import { normalizeOptionalString } from "../../lib/normalize-optional";
import { isSchoolAdmin } from "../../lib/roles";
import { useCurrentUser } from "../shell/use-current-user";
import { useUpdateSchool } from "./use-school";

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  NURSERY_PRIMARY: "Nursery & Primary",
  SECONDARY: "Secondary",
  COMBINED: "Combined",
};

function toDefaults(school: CurrentUserSchool): UpdateSchoolInput {
  return {
    name: school.name,
    address: school.address ?? "",
    phone: school.phone ?? "",
    email: school.email ?? "",
  };
}

export function SchoolProfilePage() {
  const currentUser = useCurrentUser();
  const school = currentUser.data?.school;
  const canEdit = isSchoolAdmin(currentUser.data?.role);
  const updateSchool = useUpdateSchool(school?.id ?? "");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateSchoolInput>({
    resolver: zodResolver(updateSchoolSchema),
    defaultValues: school ? toDefaults(school) : undefined,
  });

  useEffect(() => {
    if (school) {
      reset(toDefaults(school));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id]);

  if (currentUser.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading school profile…
      </div>
    );
  }

  if (currentUser.isError || !school) {
    return <p className="text-sm text-danger">Couldn&apos;t load your school&apos;s profile. Please refresh the page.</p>;
  }

  const onSubmit = handleSubmit((values) => {
    updateSchool.mutate(
      {
        name: values.name,
        address: normalizeOptionalString(values.address),
        phone: normalizeOptionalString(values.phone),
        email: normalizeOptionalString(values.email),
      },
      { onSuccess: (updated) => reset(toDefaults(updated)) },
    );
  });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-6">
          <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="school-type">Type</Label>
                <Input id="school-type" value={SCHOOL_TYPE_LABELS[school.type] ?? school.type} disabled />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="school-status">Status</Label>
                <Input id="school-status" value={school.status === "ACTIVE" ? "Active" : "Suspended"} disabled />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-name">School name</Label>
              <Input id="school-name" disabled={!canEdit} {...register("name")} />
              <FieldError message={errors.name?.message} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="school-address">Address</Label>
              <Input id="school-address" disabled={!canEdit} {...register("address")} />
              <FieldError message={errors.address?.message} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="school-phone">Phone</Label>
                <Input id="school-phone" disabled={!canEdit} {...register("phone")} />
                <FieldError message={errors.phone?.message} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="school-email">Email</Label>
                <Input id="school-email" type="email" disabled={!canEdit} {...register("email")} />
                <FieldError message={errors.email?.message} />
              </div>
            </div>

            {updateSchool.isError && (
              <p role="alert" className="text-sm text-danger">
                {getErrorMessage(updateSchool.error)}
              </p>
            )}
            {updateSchool.isSuccess && !isDirty && (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Saved.
              </p>
            )}

            {canEdit && (
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => reset(toDefaults(school))} disabled={!isDirty}>
                  Discard changes
                </Button>
                <Button type="submit" disabled={!isDirty || updateSchool.isPending}>
                  {updateSchool.isPending && <Spinner className="mr-2" />}
                  Save changes
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
