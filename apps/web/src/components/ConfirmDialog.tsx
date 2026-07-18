import { useEffect, useState, type ReactNode } from "react";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Spinner } from "./ui/spinner";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** When requireTypedConfirmation is set, called with the exact text the user typed. */
  onConfirm: (typedValue?: string) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  confirmTone?: "default" | "danger";
  /** If set, the confirm button stays disabled until the user types this exact string. */
  requireTypedConfirmation?: string;
  /** Extra fields rendered above the typed-confirmation input, e.g. a required reason field. */
  children?: ReactNode;
  /** Additional external condition (e.g. a required field elsewhere is empty) that disables confirm. */
  confirmDisabled?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isConfirming = false,
  confirmTone = "default",
  requireTypedConfirmation,
  children,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const [typedValue, setTypedValue] = useState("");

  useEffect(() => {
    if (!open) {
      setTypedValue("");
    }
  }, [open]);

  const typedMismatch = requireTypedConfirmation !== undefined && typedValue !== requireTypedConfirmation;
  const disabled = isConfirming || confirmDisabled || typedMismatch;

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-text">{title}</h2>
          {description && <div className="mt-1 text-sm text-muted">{description}</div>}
        </div>

        {children}

        {requireTypedConfirmation !== undefined && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm-typed-value">
              Type <span className="font-semibold text-text">{requireTypedConfirmation}</span> to confirm
            </Label>
            <Input
              id="confirm-typed-value"
              value={typedValue}
              onChange={(event) => setTypedValue(event.target.value)}
              autoComplete="off"
            />
          </div>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(typedValue)}
            disabled={disabled}
            className={confirmTone === "danger" ? "bg-danger hover:bg-danger/90" : undefined}
          >
            {isConfirming && <Spinner className="mr-2" />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
