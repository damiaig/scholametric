import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  JOB_TITLES,
  JOB_TITLE_LABELS,
  PERSONNEL_ROLES,
  PERSONNEL_ROLE_LABELS,
  updatePersonnelSchema,
  type PersonnelSummary,
  type UpdatePersonnelInput,
} from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useUpdatePersonnel } from "./use-personnel";

interface EditPersonnelDialogProps {
  person: PersonnelSummary;
  open: boolean;
  onClose: () => void;
}

function toDefaults(person: PersonnelSummary): UpdatePersonnelInput {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    role: person.role,
    jobTitle: person.jobTitle,
    phone: person.phone ?? "",
    qualification: person.qualification ?? "",
    status: person.status,
  };
}

export function EditPersonnelDialog({ person, open, onClose }: EditPersonnelDialogProps) {
  const updatePersonnel = useUpdatePersonnel();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdatePersonnelInput>({
    resolver: zodResolver(updatePersonnelSchema),
    defaultValues: toDefaults(person),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaults(person));
    }
  }, [open, person, reset]);

  const onSubmit = handleSubmit((values) => {
    updatePersonnel.mutate({ id: person.id, input: values }, { onSuccess: () => onClose() });
  });

  return (
    <Dialog open={open} onClose={onClose} title="Edit staff member">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Edit staff member</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-personnel-first-name">First name</Label>
          <Input id="edit-personnel-first-name" {...register("firstName")} />
          <FieldError message={errors.firstName?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-personnel-last-name">Last name</Label>
          <Input id="edit-personnel-last-name" {...register("lastName")} />
          <FieldError message={errors.lastName?.message} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-personnel-role">Role</Label>
            <Select id="edit-personnel-role" {...register("role")}>
              {PERSONNEL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {PERSONNEL_ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
            <FieldError message={errors.role?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-personnel-job-title">Title</Label>
            <Select id="edit-personnel-job-title" {...register("jobTitle")}>
              {JOB_TITLES.map((title) => (
                <option key={title} value={title}>
                  {JOB_TITLE_LABELS[title]}
                </option>
              ))}
            </Select>
            <FieldError message={errors.jobTitle?.message} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted">
          Role controls what they can do; title is their position in the school.
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-personnel-phone">Phone (optional)</Label>
          <Input id="edit-personnel-phone" {...register("phone")} />
          <FieldError message={errors.phone?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-personnel-qualification">Qualification (optional)</Label>
          <Input id="edit-personnel-qualification" {...register("qualification")} />
          <FieldError message={errors.qualification?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-personnel-status">Status</Label>
          <Select id="edit-personnel-status" {...register("status")}>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
          </Select>
          <FieldError message={errors.status?.message} />
        </div>

        {updatePersonnel.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(updatePersonnel.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updatePersonnel.isPending}>
            {updatePersonnel.isPending && <Spinner className="mr-2" />}
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
