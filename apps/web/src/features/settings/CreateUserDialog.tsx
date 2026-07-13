import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema, type CreateUserInput, type CreateUserResponse } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCreateStaffUser } from "./use-staff-users";
import { OneTimePasswordDisplay } from "./OneTimePasswordDisplay";

interface CreateUserDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateUserDialog({ open, onClose }: CreateUserDialogProps) {
  const createUser = useCreateStaffUser();
  const [created, setCreated] = useState<CreateUserResponse | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { email: "", firstName: "", lastName: "", role: undefined },
  });

  function handleClose() {
    reset();
    setCreated(null);
    onClose();
  }

  const onSubmit = handleSubmit((values) => {
    createUser.mutate(values, { onSuccess: (result) => setCreated(result) });
  });

  if (created) {
    return (
      <Dialog open={open} onClose={handleClose} title="User created">
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold text-text">
            {created.user.firstName} {created.user.lastName} was created
          </h2>
          <p className="text-sm text-muted">Temporary password:</p>
          <OneTimePasswordDisplay password={created.temporaryPassword} />
          <div className="flex justify-end">
            <Button type="button" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} title="New user">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">New user</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-first-name">First name</Label>
          <Input id="user-first-name" {...register("firstName")} />
          <FieldError message={errors.firstName?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-last-name">Last name</Label>
          <Input id="user-last-name" {...register("lastName")} />
          <FieldError message={errors.lastName?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-email">Email</Label>
          <Input id="user-email" type="email" {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="user-role">Role</Label>
          <Select id="user-role" defaultValue="" {...register("role")}>
            <option value="" disabled>
              Select a role…
            </option>
            <option value="TEACHER">Teacher</option>
            <option value="SCHOOL_ADMIN">School admin</option>
          </Select>
          <FieldError message={errors.role?.message} />
        </div>
        {createUser.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(createUser.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createUser.isPending}>
            {createUser.isPending && <Spinner className="mr-2" />}
            Create
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
