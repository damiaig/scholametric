import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createPersonnelSchema,
  JOB_TITLES,
  JOB_TITLE_LABELS,
  PERSONNEL_ROLES,
  PERSONNEL_ROLE_LABELS,
  type CreatePersonnelInput,
} from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreatePersonnel } from "./use-personnel";

interface CreatePersonnelDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreatePersonnelDialog({ open, onClose }: CreatePersonnelDialogProps) {
  const createPersonnel = useCreatePersonnel();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreatePersonnelInput>({
    resolver: zodResolver(createPersonnelSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      role: undefined,
      jobTitle: undefined,
      phone: "",
      qualification: "",
      dateEmployed: "",
      password: "",
    },
  });

  function handleClose() {
    reset();
    createPersonnel.reset();
    onClose();
  }

  const onSubmit = handleSubmit((values) => {
    createPersonnel.mutate(values, { onSuccess: handleClose });
  });

  return (
    <Dialog open={open} onClose={handleClose} title="New staff member">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">New staff member</h2>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="personnel-first-name">First name</Label>
          <Input id="personnel-first-name" {...register("firstName")} />
          <FieldError message={errors.firstName?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="personnel-last-name">Last name</Label>
          <Input id="personnel-last-name" {...register("lastName")} />
          <FieldError message={errors.lastName?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="personnel-email">Email</Label>
          <Input id="personnel-email" type="email" {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="personnel-role">Role</Label>
            <Select id="personnel-role" defaultValue="" {...register("role")}>
              <option value="" disabled>
                Select a role…
              </option>
              {PERSONNEL_ROLES.map((role) => (
                <option key={role} value={role}>
                  {PERSONNEL_ROLE_LABELS[role]}
                </option>
              ))}
            </Select>
            <FieldError message={errors.role?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="personnel-job-title">Title</Label>
            <Select id="personnel-job-title" defaultValue="" {...register("jobTitle")}>
              <option value="" disabled>
                Select a title…
              </option>
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
          <Label htmlFor="personnel-phone">Phone (optional)</Label>
          <Input id="personnel-phone" {...register("phone")} />
          <FieldError message={errors.phone?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="personnel-qualification">Qualification (optional)</Label>
          <Input id="personnel-qualification" {...register("qualification")} />
          <FieldError message={errors.qualification?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="personnel-date-employed">Date employed (optional)</Label>
          <Input id="personnel-date-employed" type="date" {...register("dateEmployed")} />
          <FieldError message={errors.dateEmployed?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="personnel-password">Password</Label>
          <Input id="personnel-password" type="password" autoComplete="new-password" {...register("password")} />
          <FieldError message={errors.password?.message} />
        </div>

        {createPersonnel.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(createPersonnel.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createPersonnel.isPending}>
            {createPersonnel.isPending && <Spinner className="mr-2" />}
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
