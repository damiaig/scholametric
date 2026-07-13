import { useEffect, useState } from "react";
import type { Student } from "@scholametric/shared";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { getErrorMessage } from "../../lib/api-client";
import { useWithdrawStudent } from "./use-withdraw-student";

interface WithdrawStudentDialogProps {
  student: Student;
  open: boolean;
  onClose: () => void;
}

export function WithdrawStudentDialog({ student, open, onClose }: WithdrawStudentDialogProps) {
  const [reason, setReason] = useState("");
  const withdrawStudent = useWithdrawStudent(student.id);

  useEffect(() => {
    if (!open) {
      setReason("");
    }
  }, [open]);

  function handleConfirm() {
    withdrawStudent.mutate({ reason }, { onSuccess: () => onClose() });
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Withdraw student"
      description={`This marks ${student.firstName} ${student.lastName} as withdrawn. They'll be hidden from the default students list.`}
      confirmLabel="Withdraw"
      confirmTone="danger"
      isConfirming={withdrawStudent.isPending}
      requireTypedConfirmation={student.lastName}
      confirmDisabled={reason.trim().length === 0}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="withdraw-reason">Reason</Label>
        <Input id="withdraw-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      </div>
      {withdrawStudent.isError && (
        <p role="alert" className="text-sm text-danger">
          {getErrorMessage(withdrawStudent.error)}
        </p>
      )}
    </ConfirmDialog>
  );
}
