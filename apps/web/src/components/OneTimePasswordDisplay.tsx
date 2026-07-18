import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { Button } from "./ui/button";

interface OneTimePasswordDisplayProps {
  password: string;
}

/** Shown once after creating a user or resetting a password — never retrievable again. */
export function OneTimePasswordDisplay({ password }: OneTimePasswordDisplayProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-md border border-muted/30 bg-background px-3 py-2">
        <span className="select-all font-mono text-base text-text">{password}</span>
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          {copied ? (
            <Check className="h-4 w-4 text-success" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-text">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
        <p>This password will not be shown again. Share it with the user now — if it's lost, use reset password to generate a new one.</p>
      </div>
    </div>
  );
}
