import { Printer } from "lucide-react";
import type { ReissuedPortalAccount } from "@scholametric/shared";
import { Button } from "../../components/ui/button";
import { CredentialSlipDocument } from "./CredentialSlipDocument";

interface CredentialSlipsPrintViewProps {
  schoolName?: string;
  accounts: ReissuedPortalAccount[];
}

// Client-side print only (window.print()) — no server-side file storage,
// same approach as ReportCardPage.tsx (SPEC_V0.6.md §5 step 5).
export function CredentialSlipsPrintView({ schoolName, accounts }: CredentialSlipsPrintViewProps) {
  if (accounts.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex justify-end print:hidden">
        <Button type="button" size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" /> Print {accounts.length} slip{accounts.length === 1 ? "" : "s"}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
        {accounts.map((account) => (
          <CredentialSlipDocument
            key={account.id}
            schoolName={schoolName}
            role={account.role}
            displayName={account.displayName}
            username={account.username}
            tempPassword={account.tempPassword}
          />
        ))}
      </div>
    </div>
  );
}
