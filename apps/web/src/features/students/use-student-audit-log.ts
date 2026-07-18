import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AuditLogEntry, Paginated } from "@scholametric/shared";
import { apiRequest } from "../../lib/api-client";

const PAGE_SIZE = 10;

// Scoped to entityType=student (this student's own row) — studentGuardian/
// guardian audit rows are logged against the link/guardian's own id, not
// the student's, so they can't be pulled in via this one filtered query
// without an N+1 across every link the student has ever had (including
// removed ones). See docs/DECISIONS.md.
export function useStudentAuditLog(studentId: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: ["audit-logs", "student", studentId, { page }],
    queryFn: () =>
      apiRequest<Paginated<AuditLogEntry>>("/api/v1/audit-logs", {
        query: { entityType: "student", entityId: studentId, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
    enabled,
  });
}
