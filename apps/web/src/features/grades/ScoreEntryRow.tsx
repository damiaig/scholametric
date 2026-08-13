import { memo, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { AlertTriangle, Check, Circle, Lock } from "lucide-react";
import { validateGridScore } from "@scholametric/shared";
import { Input } from "../../components/ui/input";
import { Spinner } from "../../components/ui/spinner";
import { Avatar } from "../../components/Avatar";
import { cn } from "../../lib/utils";
import type { CellState } from "./use-score-entry-save-queue";

export interface ScoreEntryRowStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  admissionNumber: string;
}

interface ScoreEntryRowProps {
  student: ScoreEntryRowStudent;
  cellState: CellState;
  maxScore: number;
  onEdit: (studentId: string, value: number | null) => void;
  onNavigate: (studentId: string, direction: "next" | "prev") => void;
  registerInput: (studentId: string, el: HTMLInputElement | null) => void;
}

function formatValue(value: number | null): string {
  return value === null ? "" : String(value);
}

// Only a fully-formed number (or empty) propagates to the save queue —
// mid-typing states like "7." or "-" are allowed to display (local text
// state below) without being sent anywhere yet.
const COMPLETE_NUMBER = /^\d+(\.\d{0,2})?$/;

export const ScoreEntryRow = memo(function ScoreEntryRow({
  student,
  cellState,
  maxScore,
  onEdit,
  onNavigate,
  registerInput,
}: ScoreEntryRowProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState(() => formatValue(cellState.value));
  const lastPropagated = useRef(cellState.value);

  // Resync displayed text when the underlying value changes from outside
  // this input's own typing (hydration, a refresh) — but never while the
  // user is actively focused here, so we don't clobber in-progress typing.
  useEffect(() => {
    const isFocused = document.activeElement === inputRef.current;
    if (!isFocused && cellState.value !== lastPropagated.current) {
      setText(formatValue(cellState.value));
      lastPropagated.current = cellState.value;
    }
  }, [cellState.value]);

  const isLocked = cellState.status === "locked";
  const validation = text.trim() === "" ? { isValid: true } : validateGridScore(Number(text), maxScore);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    setText(raw);
    if (raw.trim() === "") {
      lastPropagated.current = null;
      onEdit(student.studentId, null);
      return;
    }
    if (COMPLETE_NUMBER.test(raw)) {
      const parsed = Number(raw);
      lastPropagated.current = parsed;
      onEdit(student.studentId, parsed);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onNavigate(student.studentId, event.shiftKey ? "prev" : "next");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onNavigate(student.studentId, "next");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onNavigate(student.studentId, "prev");
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-muted/10 p-3 last:border-0 sm:flex-row sm:items-center sm:gap-4",
        isLocked && "bg-muted/5",
      )}
    >
      <div className="flex min-w-0 items-center gap-3 sm:w-64 sm:shrink-0">
        <Avatar firstName={student.firstName} lastName={student.lastName} />
        <div className="min-w-0">
          <p className="truncate font-medium text-text">
            {student.firstName} {student.lastName}
          </p>
          <p className="truncate font-mono text-xs text-muted">{student.admissionNumber}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:w-36">
        <Input
          ref={(el) => {
            inputRef.current = el;
            registerInput(student.studentId, el);
          }}
          type="text"
          inputMode="decimal"
          aria-label={`Score for ${student.firstName} ${student.lastName}`}
          value={text}
          disabled={isLocked}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className={cn("w-24", !validation.isValid && "border-danger focus-visible:ring-danger")}
        />
        <StatusGlyph status={cellState.status} />
      </div>

      {(cellState.error || !validation.isValid) && (
        <p className="text-xs text-danger sm:ml-2">{cellState.error ?? validation.error}</p>
      )}
    </div>
  );
});

function StatusGlyph({ status }: { status: CellState["status"] }) {
  switch (status) {
    case "pending":
      return <Circle className="h-3.5 w-3.5 shrink-0 fill-muted text-muted" aria-label="Not yet saved" />;
    case "saving":
      // Spinner only forwards className, not aria-label — wrap it instead
      // of extending the shared primitive for one call site.
      return (
        <span aria-label="Saving">
          <Spinner className="h-3.5 w-3.5 shrink-0 text-primary" />
        </span>
      );
    case "saved":
      return <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-label="Saved" />;
    case "error":
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" aria-label="Couldn't save, retrying" />;
    case "locked":
      return <Lock className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Published, locked" />;
    default:
      return <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
}
