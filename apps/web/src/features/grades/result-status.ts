import type { ResultStatus } from "@scholametric/shared";
import type { BadgeTone } from "../../components/StatusBadge";

const STATUS_TONE: Record<ResultStatus, BadgeTone> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  PUBLISHED: "success",
};

const STATUS_LABEL: Record<ResultStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  PUBLISHED: "Published",
};

// Shown to every viewer, not gated to admin/owner — a TEACHER already sees
// their own subject's lock state in the entry grid, so a status badge here
// doesn't leak anything they don't already know (SPEC_V0.4.md §4 step 5).
export function resultStatusTone(status: ResultStatus): BadgeTone {
  return STATUS_TONE[status];
}

export function resultStatusLabel(status: ResultStatus): string {
  return STATUS_LABEL[status];
}
