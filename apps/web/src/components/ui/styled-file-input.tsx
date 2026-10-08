import { useRef, useState } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

interface StyledFileInputProps {
  /** Visible button text — caller's choice (e.g. "Attach a file", "Upload your work"), not a one-size-fits-all default. */
  buttonLabel: string;
  onFileSelected: (file: File) => void;
  disabled?: boolean;
  className?: string;
}

// v0.8.3 step 5 (SPEC_V0.8.3.md §2.8, Item 8) — the one shared file-input
// skin, reused by every raw <input type="file"> in the app (confirmed by
// audit: exactly two sites). Wraps a REAL <input type="file">, hidden via
// sr-only (not display:none, not removed) and triggered by a styled
// Button — existing tests' `document.querySelector('input[type="file"]')`
// + `userEvent.upload()` keep working unchanged against the real node.
// This also removes the browser's native French "Choisir un fichier /
// Aucun fichier choisi" (OS-locale) text, replacing it with this
// app-controlled English label.
//
// value="" is reset synchronously on every change — required so the same
// file can be re-selected and still fire a change event (browsers don't
// re-fire change for an unchanged input value); both sites already did
// this before this component existed. The chosen-file display shows only
// "what was picked here" — it has no knowledge of upload success/failure;
// progress spinners and error/retry UI stay external, caller-rendered
// siblings exactly as they are today.
export function StyledFileInput({ buttonLabel, onFileSelected, disabled, className }: StyledFileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosenFileName, setChosenFileName] = useState<string | null>(null);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setChosenFileName(file.name);
    onFileSelected(file);
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
        {buttonLabel}
      </Button>
      <input ref={inputRef} type="file" tabIndex={-1} disabled={disabled} onChange={handleChange} className="sr-only" />
      <span className="truncate text-sm text-muted">{chosenFileName ?? "No file chosen"}</span>
    </div>
  );
}
