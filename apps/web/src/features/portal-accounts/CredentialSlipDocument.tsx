import type { PortalAccountRole } from "@scholametric/shared";

interface CredentialSlipDocumentProps {
  schoolName?: string;
  role: PortalAccountRole;
  displayName: string;
  username: string;
  tempPassword: string;
}

// SPEC_V0.6.md §5 step 5 — one printable slip: school, username, temp
// password, and the forced-first-login-change note. Purely presentational,
// reused for a single reissue and for every account in a batch (no
// server-side file — client print only, same approach as ReportCardDocument).
export function CredentialSlipDocument({ schoolName, role, displayName, username, tempPassword }: CredentialSlipDocumentProps) {
  return (
    <div className="break-inside-avoid rounded-lg border border-muted/20 bg-card p-4 text-text print:border-muted/40">
      <p className="text-sm font-semibold">{schoolName}</p>
      <p className="text-xs text-muted">{role === "STUDENT" ? "Student portal login" : "Parent/guardian portal login"}</p>
      <p className="mt-2 text-base font-medium">{displayName}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">Username</dt>
        <dd className="font-mono">{username}</dd>
        <dt className="text-muted">Temporary password</dt>
        <dd className="font-mono">{tempPassword}</dd>
      </dl>
      <p className="mt-3 text-xs text-muted">You&apos;ll be asked to choose a new password the first time you log in.</p>
    </div>
  );
}
