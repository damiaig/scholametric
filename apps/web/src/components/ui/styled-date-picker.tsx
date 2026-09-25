import { useEffect, useRef } from "react";
import flatpickr from "flatpickr";
import type { Instance } from "flatpickr/dist/types/instance";
import { CalendarDays } from "lucide-react";
import { cn } from "../../lib/utils";
import "flatpickr/dist/flatpickr.min.css";
import "./styled-date-picker.css";

interface StyledDatePickerProps {
  /** "YYYY-MM-DD" */
  value: string;
  onChange: (value: string) => void;
  /** "YYYY-MM-DD", or flatpickr's own literal "today" */
  minDate?: string;
  "aria-label"?: string;
  className?: string;
}

function parseISODate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// flatpickr parses a plain string minDate against its OWN configured
// dateFormat/altFormat, not ISO — since this component sets a friendly
// display dateFormat ("M j, Y"), an ISO "YYYY-MM-DD" minDate needs
// converting to a Date first. "today" is flatpickr's own special-cased
// keyword (handled before format parsing), so it passes through as-is.
function resolveMinDate(minDate: string | undefined): Date | string | undefined {
  if (!minDate || minDate === "today") {
    return minDate;
  }
  return parseISODate(minDate);
}

// v0.8.1 step 1 (SPEC_V0.8.1.md §2.2) — ONE shared, styled wrapper around
// flatpickr (the raw library, not the separate react-flatpickr package —
// keeping this to exactly one new dependency). Reused as-is by later
// steps for other date inputs (§2.6). The bound input is readOnly and
// shows flatpickr's own friendly-formatted date; it's deliberately NOT
// controlled via React's `value=` (flatpickr owns that DOM node once
// mounted) — external changes to `value` (Prev/Next/Today buttons, not
// the user picking a day in the calendar) are pushed in imperatively via
// `.setDate()` in an effect instead.
export function StyledDatePicker({ value, onChange, minDate, className, ...aria }: StyledDatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const instanceRef = useRef<Instance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!inputRef.current) {
      return undefined;
    }
    const instance = flatpickr(inputRef.current, {
      dateFormat: "M j, Y",
      defaultDate: parseISODate(value),
      minDate: resolveMinDate(minDate),
      onChange: (selectedDates) => {
        if (selectedDates[0]) {
          onChangeRef.current(toISODate(selectedDates[0]));
        }
      },
    });
    instanceRef.current = instance;
    return () => instance.destroy();
    // Instantiated once on mount; `value`/`minDate` updates are pushed in
    // imperatively below instead of re-creating the widget on every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    instanceRef.current?.set("minDate", resolveMinDate(minDate));
  }, [minDate]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) {
      return;
    }
    const current = instance.selectedDates[0] ? toISODate(instance.selectedDates[0]) : undefined;
    if (current !== value) {
      instance.setDate(parseISODate(value), false);
    }
  }, [value]);

  return (
    <div className="relative inline-flex items-center">
      <CalendarDays className="pointer-events-none absolute left-3 h-4 w-4 text-muted" aria-hidden="true" />
      <input
        ref={inputRef}
        readOnly
        className={cn(
          "h-9 cursor-pointer rounded-md border border-muted bg-card py-2 pl-9 pr-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          className,
        )}
        {...aria}
      />
    </div>
  );
}
