import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editGuardianSchema, type EditGuardianInput, type StudentGuardianSummary } from "@scholametric/shared";
import { Dialog } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { FieldError } from "../../../components/FieldError";
import { Spinner } from "../../../components/ui/spinner";
import { getErrorMessage } from "../../../lib/api-client";
import { useUpdateGuardian } from "./use-student-guardians";

interface EditGuardianDialogProps {
  studentId: string;
  guardian: StudentGuardianSummary;
  open: boolean;
  onClose: () => void;
}

function toDefaults(guardian: StudentGuardianSummary): EditGuardianInput {
  return {
    firstName: guardian.firstName,
    lastName: guardian.lastName,
    phone: guardian.phone,
    email: guardian.email ?? "",
    address: guardian.address ?? "",
  };
}

// Edits the shared Guardian record itself (PATCH /guardians/:id) — if this
// guardian is linked to more than one student (a sibling), every linked
// student reflects the change immediately, since they share one row.
export function EditGuardianDialog({ studentId, guardian, open, onClose }: EditGuardianDialogProps) {
  const updateGuardian = useUpdateGuardian(studentId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditGuardianInput>({
    resolver: zodResolver(editGuardianSchema),
    defaultValues: toDefaults(guardian),
  });

  useEffect(() => {
    if (open) {
      reset(toDefaults(guardian));
    }
  }, [open, guardian, reset]);

  const onSubmit = handleSubmit((values) => {
    updateGuardian.mutate({ guardianId: guardian.guardianId, input: values }, { onSuccess: () => onClose() });
  });

  return (
    <Dialog open={open} onClose={onClose} title="Edit guardian">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Edit guardian</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-guardian-first-name">First name</Label>
            <Input id="edit-guardian-first-name" {...register("firstName")} />
            <FieldError message={errors.firstName?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-guardian-last-name">Last name</Label>
            <Input id="edit-guardian-last-name" {...register("lastName")} />
            <FieldError message={errors.lastName?.message} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-guardian-phone">Phone</Label>
          <Input id="edit-guardian-phone" {...register("phone")} />
          <FieldError message={errors.phone?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-guardian-email">Email (optional)</Label>
          <Input id="edit-guardian-email" type="email" {...register("email")} />
          <FieldError message={errors.email?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="edit-guardian-address">Address (optional)</Label>
          <Input id="edit-guardian-address" {...register("address")} />
          <FieldError message={errors.address?.message} />
        </div>
        {updateGuardian.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(updateGuardian.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateGuardian.isPending}>
            {updateGuardian.isPending && <Spinner className="mr-2" />}
            Save changes
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
