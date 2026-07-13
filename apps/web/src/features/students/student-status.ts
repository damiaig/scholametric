import type { StudentStatus } from "@scholametric/shared";
import type { BadgeTone } from "../../components/StatusBadge";

const STATUS_TONE: Record<StudentStatus, BadgeTone> = {
  ACTIVE: "success",
  SUSPENDED: "warning",
  GRADUATED: "info",
  TRANSFERRED: "neutral",
  WITHDRAWN: "danger",
};

const STATUS_LABEL: Record<StudentStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  GRADUATED: "Graduated",
  TRANSFERRED: "Transferred",
  WITHDRAWN: "Withdrawn",
};

export function studentStatusTone(status: StudentStatus): BadgeTone {
  return STATUS_TONE[status];
}

export function studentStatusLabel(status: StudentStatus): string {
  return STATUS_LABEL[status];
}

export const STUDENT_STATUS_FILTER_OPTIONS: { value: StudentStatus | ""; label: string }[] = [
  { value: "", label: "All (excl. withdrawn)" },
  { value: "ACTIVE", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "GRADUATED", label: "Graduated" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "WITHDRAWN", label: "Withdrawn" },
];
