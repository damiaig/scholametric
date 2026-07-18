import { useState } from "react";
import { Search } from "lucide-react";
import type { StudentGuardianSummary } from "@scholametric/shared";
import { Input } from "../../../components/ui/input";
import { Spinner } from "../../../components/ui/spinner";
import { useGlobalStudentSearch } from "../../shell/use-global-student-search";
import { useStudentGuardians } from "./use-student-guardians";

interface SiblingGuardianPickerProps {
  /**
   * Excluded from search results — a student can't be their own sibling.
   * Omitted on the new-student form, where there's no student id yet.
   */
  excludeStudentId?: string;
  selectedGuardianId: string | undefined;
  onSelect: (guardianId: string, guardianName: string) => void;
}

// The sibling flow: no guardian-search endpoint exists (see
// docs/DECISIONS.md), so this searches STUDENTS by name instead, then lists
// that student's own guardians to pick one to link.
export function SiblingGuardianPicker({ excludeStudentId, selectedGuardianId, onSelect }: SiblingGuardianPickerProps) {
  const [query, setQuery] = useState("");
  const [siblingId, setSiblingId] = useState<string | null>(null);
  const [siblingName, setSiblingName] = useState("");
  const studentSearch = useGlobalStudentSearch(query);
  const siblingGuardians = useStudentGuardians(siblingId ?? "");

  const results = (studentSearch.data ?? []).filter((student) => student.id !== (excludeStudentId ?? ""));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="sibling-search" className="text-sm font-medium text-text">
          Find the sibling
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <Input
            id="sibling-search"
            placeholder="Search students by name…"
            className="pl-9"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSiblingId(null);
            }}
          />
        </div>
        {studentSearch.enabled && studentSearch.isLoading && (
          <p className="flex items-center gap-2 text-xs text-muted">
            <Spinner /> Searching…
          </p>
        )}
        {studentSearch.enabled && !studentSearch.isLoading && !siblingId && (
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-muted/20 p-1">
            {results.length === 0 && <p className="px-2 py-1.5 text-sm text-muted">No students found.</p>}
            {results.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => {
                  setSiblingId(student.id);
                  setSiblingName(`${student.firstName} ${student.lastName}`);
                }}
                className="rounded-md px-2 py-1.5 text-left text-sm hover:bg-background"
              >
                <span className="font-medium text-text">
                  {student.firstName} {student.lastName}
                </span>
                <span className="ml-2 font-mono text-xs text-muted">{student.admissionNumber}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {siblingId && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-text">{siblingName}&apos;s guardians</p>
          {siblingGuardians.isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner /> Loading…
            </p>
          )}
          {siblingGuardians.isError && <p className="text-sm text-danger">Couldn&apos;t load their guardians.</p>}
          {siblingGuardians.data?.length === 0 && (
            <p className="text-sm text-muted">This student has no guardians on record.</p>
          )}
          <div className="flex flex-col gap-1">
            {(siblingGuardians.data ?? []).map((guardian: StudentGuardianSummary) => (
              <label
                key={guardian.guardianId}
                className="flex items-center gap-2 rounded-md border border-muted/20 px-3 py-2 text-sm hover:bg-background"
              >
                <input
                  type="radio"
                  name="sibling-guardian"
                  checked={selectedGuardianId === guardian.guardianId}
                  onChange={() => onSelect(guardian.guardianId, `${guardian.firstName} ${guardian.lastName}`)}
                  className="h-4 w-4 border-muted text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                />
                <span className="font-medium text-text">
                  {guardian.firstName} {guardian.lastName}
                </span>
                <span className="text-xs text-muted">{guardian.phone}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
