import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search, CircleAlert, SearchX } from "lucide-react";
import type { Student } from "@scholametric/shared";
import { Input } from "../../components/ui/input";
import { Spinner } from "../../components/ui/spinner";
import { cn } from "../../lib/utils";
import { useGlobalStudentSearch } from "./use-global-student-search";

// Same debounced-search + arrow/Enter keyboard-nav pattern as the login
// page's SchoolPickerModal, adapted to an inline dropdown instead of a
// modal — this one lives in the persistent top bar (SPEC_V0.1.md §4).
export function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listboxId = useId();
  const { data, isLoading, isError, enabled } = useGlobalStudentSearch(query);
  const results = data ?? [];

  useEffect(() => {
    setHighlightedIndex(0);
  }, [results.length]);

  function selectStudent(student: Student) {
    navigate(`/students/${student.id}`);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const student = results[highlightedIndex];
      if (student) selectStudent(student);
    }
  }

  const showDropdown = open && enabled;
  const activeOptionId = results[highlightedIndex] ? `${listboxId}-${results[highlightedIndex].id}` : undefined;

  return (
    <div className="relative w-full max-w-sm">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <Input
        role="combobox"
        aria-label="Search students"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        placeholder="Search students…"
        className="pl-9"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Matching students"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-muted/20 bg-card p-1 shadow-lg"
        >
          {isLoading && (
            <p className="flex items-center justify-center gap-2 px-2 py-4 text-sm text-muted">
              <Spinner /> Searching…
            </p>
          )}
          {isError && (
            <p className="flex items-center justify-center gap-2 px-2 py-4 text-sm text-danger">
              <CircleAlert className="h-4 w-4" aria-hidden="true" />
              Couldn&apos;t search students.
            </p>
          )}
          {!isLoading && !isError && results.length === 0 && (
            <p className="flex items-center justify-center gap-2 px-2 py-4 text-sm text-muted">
              <SearchX className="h-4 w-4" aria-hidden="true" />
              No students found.
            </p>
          )}
          {!isLoading &&
            !isError &&
            results.map((student, index) => (
              <button
                key={student.id}
                id={`${listboxId}-${student.id}`}
                role="option"
                aria-selected={index === highlightedIndex}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectStudent(student)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "flex w-full flex-col rounded-md px-3 py-2 text-left text-sm",
                  index === highlightedIndex ? "bg-primary/10 text-primary" : "text-text hover:bg-background",
                )}
              >
                <span className="font-medium">
                  {student.firstName} {student.lastName}
                </span>
                <span className="font-mono text-xs text-muted">{student.admissionNumber}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
