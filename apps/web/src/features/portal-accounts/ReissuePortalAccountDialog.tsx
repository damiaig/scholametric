import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { useReissuePortalAccount } from "./use-portal-accounts";
import { CredentialSlipDocument } from "./CredentialSlipDocument";

interface ReissuePortalAccountDialogProps {
  account: { id: string; displayName: string };
  open: boolean;
  onClose: () => void;
}

// SPEC_V0.6.md §5 step 5 — reset-and-reissue for a single already-
// provisioned account: temp passwords are hashed at rest and never
// recoverable, so printing a slip later means generating a FRESH one.
export function ReissuePortalAccountDialog({ account, open, onClose }: ReissuePortalAccountDialogProps) {
  const { data: currentUser } = useCurrentUser();
  const reissue = useReissuePortalAccount();

  function handleClose() {
    reissue.reset();
    onClose();
  }

  if (reissue.data) {
    return (
      <Dialog open={open} onClose={handleClose} title="Credential slip">
        <div className="flex flex-col gap-4 p-6 print:p-0">
          <h2 className="text-lg font-semibold text-text print:hidden">New password for {account.displayName}</h2>
          <CredentialSlipDocument
            schoolName={currentUser?.school.name}
            role={reissue.data.role}
            displayName={reissue.data.displayName}
            username={reissue.data.username}
            tempPassword={reissue.data.tempPassword}
          />
          <div className="flex justify-end gap-2 print:hidden">
            <Button type="button" onClick={() => window.print()}>
              Print
            </Button>
            <Button type="button" variant="outline" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={handleClose} title="Reset & print">
      <div className="flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-text">Reset &amp; print</h2>
        <p className="text-sm text-muted">
          This generates a new temporary password for <span className="font-semibold text-text">{account.displayName}</span>{" "}
          and signs them out of any other active session. They&apos;ll be asked to choose a new password when they
          first log in.
        </p>
        {reissue.isError && (
          <p role="alert" className="text-sm text-danger">
            {getErrorMessage(reissue.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="button" disabled={reissue.isPending} onClick={() => reissue.mutate(account.id)}>
            {reissue.isPending && <Spinner className="mr-2" />}
            Reset &amp; print
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
