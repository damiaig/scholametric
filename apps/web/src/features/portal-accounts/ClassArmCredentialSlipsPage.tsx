import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import type { SkippedReissue } from "@scholametric/shared";
import { PageHeader } from "../../components/PageHeader";
import { Button } from "../../components/ui/button";
import { Spinner } from "../../components/ui/spinner";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getErrorMessage } from "../../lib/api-client";
import { useCurrentUser } from "../shell/use-current-user";
import { useClassArmDetail } from "../classes/use-class-arm-detail";
import { useReissueForClassArm } from "./use-portal-accounts";
import { CredentialSlipsPrintView } from "./CredentialSlipsPrintView";

const SKIP_REASON_LABEL: Record<SkippedReissue["reason"], string> = {
  already_changed_password: "Already changed their password",
  not_provisioned: "Not yet provisioned",
};

// SPEC_V0.6.md §5 step 5 — batch credential slips for a whole class arm.
// Generating slips is a deliberate action (a button click), never a side
// effect of navigating here — a batch reissue resets real passwords, so it
// must never fire just because an admin opened this page.
export function ClassArmCredentialSlipsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: currentUser } = useCurrentUser();
  const armQuery = useClassArmDetail(id, 1, 1);
  const reissueForClassArm = useReissueForClassArm();
  const [forceConfirmOpen, setForceConfirmOpen] = useState(false);

  const armLabel = armQuery.data ? `${armQuery.data.classLevel.name} ${armQuery.data.name}` : "";
  const result = reissueForClassArm.data;
  const alreadyChanged = (result?.skipped ?? []).filter((s) => s.reason === "already_changed_password");
  const notProvisioned = (result?.skipped ?? []).filter((s) => s.reason === "not_provisioned");

  function generate(force: boolean) {
    if (!id) return;
    reissueForClassArm.mutate({ classArmId: id, force });
  }

  return (
    <div>
      <Button type="button" variant="outline" size="sm" className="mb-4 print:hidden" onClick={() => navigate(`/classes/arms/${id}`)}>
        Back to class
      </Button>

      <PageHeader
        title="Credential slips"
        description={armQuery.data ? `${armQuery.data.classLevel.name} ${armQuery.data.name}` : undefined}
      />

      {!result && (
        <div className="rounded-lg border border-muted/20 bg-card p-6 print:hidden">
          <p className="mb-4 text-sm text-muted">
            Generates a fresh temporary password for every student and parent account in this class arm that hasn&apos;t
            already changed their password, and prints one slip per account.
          </p>
          {reissueForClassArm.isError && (
            <p role="alert" className="mb-4 text-sm text-danger">
              {getErrorMessage(reissueForClassArm.error, "Couldn't generate slips.")}
            </p>
          )}
          <Button type="button" onClick={() => generate(false)} disabled={reissueForClassArm.isPending}>
            {reissueForClassArm.isPending && <Spinner className="mr-2" />}
            Generate slips
          </Button>
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-6">
          <CredentialSlipsPrintView schoolName={currentUser?.school.name} accounts={result.reissued} />

          {(alreadyChanged.length > 0 || notProvisioned.length > 0) && (
            <div className="rounded-lg border border-muted/20 bg-card p-4 print:hidden">
              <p className="mb-2 text-sm font-medium text-text">Not included ({result.skipped.length})</p>
              <ul className="flex flex-col gap-1.5 text-sm">
                {result.skipped.map((skip) => (
                  <li key={skip.id} className="flex items-center justify-between gap-3">
                    <span className="text-text">{skip.displayName}</span>
                    <span className="text-xs text-muted">{SKIP_REASON_LABEL[skip.reason]}</span>
                  </li>
                ))}
              </ul>

              {alreadyChanged.length > 0 && (
                <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-text">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <div className="flex flex-1 flex-col gap-2">
                    <p>
                      {alreadyChanged.length} account{alreadyChanged.length === 1 ? "" : "s"} already changed their
                      password and were skipped. Forcing a reset will sign them out and require a new login.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit text-danger hover:bg-danger/10"
                      onClick={() => setForceConfirmOpen(true)}
                    >
                      Force reset {alreadyChanged.length} account{alreadyChanged.length === 1 ? "" : "s"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <Button type="button" variant="outline" size="sm" className="w-fit print:hidden" onClick={() => generate(false)}>
            {reissueForClassArm.isPending && <Spinner className="mr-2" />}
            Regenerate
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={forceConfirmOpen}
        onClose={() => setForceConfirmOpen(false)}
        onConfirm={() => {
          generate(true);
          setForceConfirmOpen(false);
        }}
        title="Force password reset"
        description={
          <>
            This resets the password for {alreadyChanged.length} famil{alreadyChanged.length === 1 ? "y" : "ies"} who
            have already logged in. They will be signed out and must use the new printed password to log in again.
          </>
        }
        confirmLabel="Force reset"
        confirmTone="danger"
        isConfirming={reissueForClassArm.isPending}
        requireTypedConfirmation={armLabel}
      >
        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-text">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p>This cannot be undone — the old password stops working immediately.</p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
