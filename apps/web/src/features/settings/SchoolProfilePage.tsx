import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Spinner } from "../../components/ui/spinner";
import { useCurrentUser } from "../shell/use-current-user";

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm text-text">{value || "—"}</dd>
    </div>
  );
}

const SCHOOL_TYPE_LABELS: Record<string, string> = {
  NURSERY_PRIMARY: "Nursery & Primary",
  SECONDARY: "Secondary",
  COMBINED: "Combined",
};

export function SchoolProfilePage() {
  const currentUser = useCurrentUser();

  if (currentUser.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Loading school profile…
      </div>
    );
  }

  if (currentUser.isError || !currentUser.data) {
    return <p className="text-sm text-danger">Couldn&apos;t load your school&apos;s profile. Please refresh the page.</p>;
  }

  const { school } = currentUser.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-text">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>Editing your school&apos;s profile isn&apos;t available in this version yet.</p>
      </div>

      <Card>
        <CardContent className="p-6">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            <InfoRow label="School name" value={school.name} />
            <InfoRow label="Type" value={SCHOOL_TYPE_LABELS[school.type] ?? school.type} />
            <InfoRow label="Status" value={school.status === "ACTIVE" ? "Active" : "Suspended"} />
            <InfoRow label="Address" value={school.address} />
            <InfoRow label="Phone" value={school.phone} />
            <InfoRow label="Email" value={school.email} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
