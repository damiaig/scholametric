import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  GUARDIAN_RELATIONSHIPS,
  GUARDIAN_RELATIONSHIP_LABELS,
  addGuardianSchema,
  type AddGuardianInput,
} from "@scholametric/shared";
import { Dialog } from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import { FieldError } from "../../../components/FieldError";
import { Spinner } from "../../../components/ui/spinner";
import { getErrorMessage } from "../../../lib/api-client";
import { useAddGuardian } from "./use-student-guardians";
import { SiblingGuardianPicker } from "./SiblingGuardianPicker";

interface AddGuardianDialogProps {
  studentId: string;
  open: boolean;
  onClose: () => void;
}

export function AddGuardianDialog({ studentId, open, onClose }: AddGuardianDialogProps) {
  const addGuardian = useAddGuardian(studentId);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<AddGuardianInput>({
    resolver: zodResolver(addGuardianSchema),
    defaultValues: { mode: "new", relationship: undefined },
  });

  const mode = watch("mode");
  const guardianId = watch("guardianId");

  function handleClose() {
    reset({ mode: "new", relationship: undefined });
    addGuardian.reset();
    onClose();
  }

  const onSubmit = handleSubmit((values) => {
    addGuardian.mutate(values, { onSuccess: handleClose });
  });

  return (
    <Dialog open={open} onClose={handleClose} title="Add guardian" className="max-w-lg">
      <form className="flex max-h-[80vh] flex-col overflow-y-auto" onSubmit={onSubmit} noValidate>
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold text-text">Add guardian</h2>

          <div className="flex gap-1 rounded-md border border-muted/30 p-1">
            <button
              type="button"
              onClick={() => setValue("mode", "new")}
              className={
                mode === "new"
                  ? "flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white"
                  : "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-background"
              }
            >
              Create new
            </button>
            <button
              type="button"
              onClick={() => setValue("mode", "existing")}
              className={
                mode === "existing"
                  ? "flex-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white"
                  : "flex-1 rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-background"
              }
            >
              Link existing (sibling)
            </button>
          </div>

          {mode === "new" ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guardian-first-name">First name</Label>
                  <Input id="guardian-first-name" {...register("firstName")} />
                  <FieldError message={errors.firstName?.message} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="guardian-last-name">Last name</Label>
                  <Input id="guardian-last-name" {...register("lastName")} />
                  <FieldError message={errors.lastName?.message} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="guardian-phone">Phone</Label>
                <Input id="guardian-phone" {...register("phone")} />
                <FieldError message={errors.phone?.message} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="guardian-email">Email (optional)</Label>
                <Input id="guardian-email" type="email" {...register("email")} />
                <FieldError message={errors.email?.message} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="guardian-address">Address (optional)</Label>
                <Input id="guardian-address" {...register("address")} />
                <FieldError message={errors.address?.message} />
              </div>
            </>
          ) : (
            <>
              <SiblingGuardianPicker
                excludeStudentId={studentId}
                selectedGuardianId={guardianId}
                onSelect={(id) => setValue("guardianId", id, { shouldValidate: true })}
              />
              <FieldError message={errors.guardianId?.message} />
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="guardian-relationship">Relationship to student</Label>
            <Select id="guardian-relationship" defaultValue="" {...register("relationship")}>
              <option value="" disabled>
                Select a relationship…
              </option>
              {GUARDIAN_RELATIONSHIPS.map((value) => (
                <option key={value} value={value}>
                  {GUARDIAN_RELATIONSHIP_LABELS[value]}
                </option>
              ))}
            </Select>
            <FieldError message={errors.relationship?.message} />
          </div>

          {addGuardian.isError && (
            <p role="alert" className="text-sm text-danger">
              {getErrorMessage(addGuardian.error)}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-muted/20 p-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={addGuardian.isPending}>
            {addGuardian.isPending && <Spinner className="mr-2" />}
            Add
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
