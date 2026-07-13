import { cn } from "../lib/utils";

interface AvatarProps {
  firstName: string;
  lastName: string;
  className?: string;
}

/** Photo-placeholder initials avatar (SPEC_V0.1.md §4) — no photo upload until a later version. */
export function Avatar({ firstName, lastName, className }: AvatarProps) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "?";
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary",
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
