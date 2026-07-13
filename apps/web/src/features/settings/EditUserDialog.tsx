import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateUserSchema, type StaffUser, type UpdateUserInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select } from "../../components/ui/select";
import { FieldError } from "../../components/FieldError";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useUpdateStaffUser } from "./use-staff-users";

interface EditUserDialogProps {
  user: StaffUser;
  open: boolean;
  onClose: () => void;
}

function toDefaults(user: StaffUser): UpdateUserInput {
  return { firstName: user.firstName, lastName: user.lastName, role: user.role, status: user.status };
}

export function EditUserDialog({ user, open, onClose }: EditUserDialogProps) {
  const updateUser = useUpdateStaffUser();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: toDefaults(user),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaults(user));
    }
  }, [open, user, reset]);

  const onSubmit = handleSubmit((values) => {
    updateUser.mutate({ id: user.id, input: values }, { onSuccess: () => onClose() });
  });

  return (
    <Dialog open={open} onClose={onClose} title="Edit user">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Edit user</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-user-first-name">First name</Label>
          <Input id="edit-user-first-name" {...register("firstName")} />
          <FieldError message={errors.firstName?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-user-last-name">Last name</Label>
          <Input id="edit-user-last-name" {...register("lastName")} />
          <FieldError message={errors.lastName?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-user-role">Role</Label>
          <Select id="edit-user-role" {...register("role")}>
            <option value="TEACHER">Teacher</option>
            <option value="SCHOOL_ADMIN">School admin</option>
          </Select>
          <FieldError message={errors.role?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-user-status">Status</Label>
          <Select id="edit-user-status" {...register("status")}>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
          </Select>
          <FieldError message={errors.status?.message} />
        </div>
        {updateUser.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(updateUser.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateUser.isPending}>
            {updateUser.isPending && <Spinner className="mr-2" />}
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
