import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { transferClassSchema, type Student, type TransferClassInput } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { ClassArmSelect } from "./ClassArmSelect";
import { useTransferClass } from "./use-transfer-class";

interface TransferClassDialogProps {
  student: Student;
  open: boolean;
  onClose: () => void;
}

export function TransferClassDialog({ student, open, onClose }: TransferClassDialogProps) {
  const transferClass = useTransferClass(student.id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TransferClassInput>({
    resolver: zodResolver(transferClassSchema),
    defaultValues: { classArmId: student.currentEnrollment?.classArmId ?? "" },
  });

  useEffect(() => {
    if (open) {
      reset({ classArmId: student.currentEnrollment?.classArmId ?? "" });
    }
  }, [open, student, reset]);

  const onSubmit = handleSubmit((values) => {
    transferClass.mutate(values, { onSuccess: () => onClose() });
  });

  return (
    <Dialog open={open} onClose={onClose} title="Transfer class">
      <form className="flex flex-col gap-4 p-6" onSubmit={onSubmit} noValidate>
        <h2 className="text-lg font-semibold text-text">Transfer class</h2>
        <ClassArmSelect register={register} name="classArmId" error={errors.classArmId?.message} />
        {transferClass.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(transferClass.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={transferClass.isPending}>
            {transferClass.isPending && <Spinner className="mr-2" />}
            Transfer
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
