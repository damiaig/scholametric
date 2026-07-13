import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { Search, CircleAlert, SearchX } from "lucide-react";
import type { SchoolSearchResult } from "@scholametric/shared";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Spinner } from "../../components/ui/spinner";
import { cn } from "../../lib/utils";
import { useSchoolSearch } from "./use-school-search";

interface SchoolPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (school: SchoolSearchResult) => void;
}

export function SchoolPickerModal({ open, onClose, onSelect }: SchoolPickerModalProps) {
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listboxId = useId();
  const { data, isLoading, isError, enabled } = useSchoolSearch(query);
  const results = data ?? [];

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [results.length]);

  function selectSchool(school: SchoolSearchResult) {
    onSelect(school);
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const school = results[highlightedIndex];
      if (school) selectSchool(school);
    }
  }

  const activeOptionId = results[highlightedIndex] ? `${listboxId}-${results[highlightedIndex].id}` : undefined;

  return (
    <Dialog open={open} onClose={onClose} title="Select your school">
      <div className="flex flex-col gap-3 p-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            autoFocus
            role="combobox"
            aria-label="Search for your school"
            aria-expanded={results.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            placeholder="Search by school name…"
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div id={listboxId} role="listbox" aria-label="Schools" className="max-h-64 overflow-y-auto">
          {!enabled && <p className="px-2 py-4 text-center text-sm text-muted">Type at least 2 characters to search.</p>}

          {enabled && isLoading && (
            <p className="flex items-center justify-center gap-2 px-2 py-4 text-sm text-muted">
              <Spinner /> Searching…
            </p>
          )}

          {enabled && isError && (
            <p className="flex items-center justify-center gap-2 px-2 py-4 text-sm text-danger">
              <CircleAlert className="h-4 w-4" aria-hidden="true" />
              Couldn&apos;t load schools. Please try again.
            </p>
          )}

          {enabled && !isLoading && !isError && results.length === 0 && (
            <p className="flex items-center justify-center gap-2 px-2 py-4 text-sm text-muted">
              <SearchX className="h-4 w-4" aria-hidden="true" />
              No schools found.
            </p>
          )}

          {enabled &&
            !isLoading &&
            !isError &&
            results.map((school, index) => (
              <button
                key={school.id}
                id={`${listboxId}-${school.id}`}
                role="option"
                aria-selected={index === highlightedIndex}
                type="button"
                onClick={() => selectSchool(school)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "flex w-full flex-col rounded-md px-3 py-2 text-left text-sm",
                  index === highlightedIndex ? "bg-primary/10 text-primary" : "text-text hover:bg-background",
                )}
              >
                <span className="font-medium">{school.name}</span>
                <span className="text-xs text-muted">{school.slug}</span>
              </button>
            ))}
        </div>
      </div>
    </Dialog>
  );
}
