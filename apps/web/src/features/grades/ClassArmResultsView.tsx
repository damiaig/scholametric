import { Pencil } from "lucide-react";
import type { ClassArmResultsResponse, ClassArmResultsSubject, ClassArmResultsSubjectRow } from "@scholametric/shared";
import { StatusBadge } from "../../components/StatusBadge";
import { resultStatusTone, resultStatusLabel } from "./result-status";
import { formatScore } from "./format-score";

export interface OverrideTarget {
  id: string;
  studentId: string;
  studentName: string;
  subjectId: string;
  subjectName: string;
  autoGrade: string | null;
  overrideGrade: string | null;
}

// "none": TEACHER, never offered. "pendingOnly": SCHOOL_ADMIN — may
// override while PENDING_APPROVAL, but not once PUBLISHED (owner-only
// past that point, GradesService.override()'s rule). "any": PROPRIETOR.
export type OverridePermission = "none" | "pendingOnly" | "any";

interface ClassArmResultsViewProps {
  data: ClassArmResultsResponse;
  overridePermission?: OverridePermission;
  onOverride?: (target: OverrideTarget) => void;
}

function positionLabel(position: number | null): string {
  return position === null ? "Not yet ranked" : `#${position}`;
}

// Override is blocked server-side while DRAFT (the total isn't final yet)
// regardless of role, and PUBLISHED is PROPRIETOR-only — don't offer a
// control that'll just 403/409, same principle as every prior step's
// RBAC-in-UI.
function canOverrideRow(row: ClassArmResultsSubjectRow, permission: OverridePermission): boolean {
  if (permission === "none" || row.status === "DRAFT") return false;
  if (row.status === "PUBLISHED") return permission === "any";
  return true; // PENDING_APPROVAL, permission is pendingOnly or any
}

// Renders GET /class-arms/:id/results — mobile: one card per student
// (CLAUDE.md §6, tables collapse to cards below sm); desktop: a
// student-by-subject matrix table, horizontally scrollable since the
// column count is subject-count-dependent (~6-10 for a real class, not a
// fixed width). A subject the caller can't see (TEACHER row-filtering)
// simply isn't in `data.subjects` — nothing special to render for that.
export function ClassArmResultsView({ data, overridePermission = "none", onOverride }: ClassArmResultsViewProps) {
  if (data.subjects.length === 0) {
    return (
      <p className="rounded-lg border border-muted/20 bg-card p-10 text-center text-sm text-muted">
        No subjects have been entered for this class and term yet.
      </p>
    );
  }

  const overallByStudent = new Map((data.overall ?? []).map((row) => [row.studentId, row]));

  function overrideButton(subject: ClassArmResultsSubject, row: ClassArmResultsSubjectRow, studentName: string) {
    if (!onOverride || !canOverrideRow(row, overridePermission)) return null;
    return (
      <button
        type="button"
        aria-label={`Override grade for ${studentName} — ${subject.subjectName}`}
        className="text-muted hover:text-primary"
        onClick={() =>
          onOverride({
            id: row.id,
            studentId: row.studentId,
            studentName,
            subjectId: subject.subjectId,
            subjectName: subject.subjectName,
            autoGrade: row.autoGrade,
            overrideGrade: row.overrideGrade,
          })
        }
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.subjects.map((subject) => (
          <div key={subject.subjectId} className="rounded-lg border border-muted/20 bg-card p-3">
            <p className="truncate text-sm font-medium text-text">{subject.subjectName}</p>
            <p className="text-xs text-muted">Class average</p>
            <p className="font-mono text-lg text-text">
              {subject.averageGrade ?? "—"} <span className="text-xs text-muted">({formatScore(subject.averageScore)})</span>
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:hidden">
        {data.students.map((student) => {
          const overall = overallByStudent.get(student.studentId);
          const studentName = `${student.firstName} ${student.lastName}`;
          return (
            <div key={student.studentId} className="rounded-lg border border-muted/20 bg-card p-3">
              <p className="font-medium text-text">{studentName}</p>
              <p className="font-mono text-xs text-muted">{student.admissionNumber}</p>
              <dl className="mt-2 flex flex-col gap-1.5">
                {data.subjects.map((subject) => {
                  const row = subject.results.find((r) => r.studentId === student.studentId);
                  return (
                    <div key={subject.subjectId} className="flex items-center justify-between gap-2 text-sm">
                      <dt className="truncate text-muted">{subject.subjectName}</dt>
                      <dd className="flex shrink-0 items-center gap-1.5 text-right text-text">
                        {row ? (
                          <>
                            {row.finalGrade ?? "—"} <span className="text-xs text-muted">({positionLabel(row.subjectPosition)})</span>
                            {overrideButton(subject, row, studentName)}
                          </>
                        ) : (
                          <span className="text-muted">Not yet entered</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {data.overall && (
                <div className="mt-2 flex items-center justify-between border-t border-muted/10 pt-2 text-sm">
                  <p className="font-medium text-text">Overall</p>
                  <p className="text-text">
                    {overall ? (
                      <>
                        {overall.averageGrade ?? "—"} <span className="text-xs text-muted">({positionLabel(overall.overallPosition)})</span>
                      </>
                    ) : (
                      <span className="text-muted">No results yet</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-muted/20 bg-card sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-muted/20">
              <th className="whitespace-nowrap px-4 py-3 font-medium text-muted">Student</th>
              {data.subjects.map((subject) => (
                <th key={subject.subjectId} className="whitespace-nowrap px-4 py-3 font-medium text-muted">
                  {subject.subjectName}
                </th>
              ))}
              {data.overall && <th className="whitespace-nowrap px-4 py-3 font-medium text-muted">Overall</th>}
            </tr>
          </thead>
          <tbody>
            {data.students.map((student) => {
              const overall = overallByStudent.get(student.studentId);
              const studentName = `${student.firstName} ${student.lastName}`;
              return (
                <tr key={student.studentId} className="border-b border-muted/10 last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-text">
                    <p>{studentName}</p>
                    <p className="font-mono text-xs text-muted">{student.admissionNumber}</p>
                  </td>
                  {data.subjects.map((subject) => {
                    const row = subject.results.find((r) => r.studentId === student.studentId);
                    return (
                      <td key={subject.subjectId} className="whitespace-nowrap px-4 py-3">
                        {row ? (
                          <div className="flex items-center gap-2">
                            <span className="text-text">{row.finalGrade ?? "—"}</span>
                            <span className="text-xs text-muted">({formatScore(row.totalScore)})</span>
                            <StatusBadge label={resultStatusLabel(row.status)} tone={resultStatusTone(row.status)} />
                            <span className="text-xs text-muted">{positionLabel(row.subjectPosition)}</span>
                            {overrideButton(subject, row, studentName)}
                          </div>
                        ) : (
                          <span className="text-sm text-muted">Not yet entered</span>
                        )}
                      </td>
                    );
                  })}
                  {data.overall && (
                    <td className="whitespace-nowrap px-4 py-3">
                      {overall ? (
                        <div className="flex items-center gap-2">
                          <span className="text-text">{overall.averageGrade ?? "—"}</span>
                          <StatusBadge label={resultStatusLabel(overall.status)} tone={resultStatusTone(overall.status)} />
                          <span className="text-xs text-muted">{positionLabel(overall.overallPosition)}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted">No results yet</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
