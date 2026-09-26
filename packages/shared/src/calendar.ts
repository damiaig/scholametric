import { z } from "zod";

// v0.8 step 1 (SPEC_V0.8.md §7 item 1) — the calendar domain's foundation:
// periods (bell schedule), breaks, holidays, per-class school-days.
// Genuinely new domain, independent of grades/exams.

// "HH:mm", zero-padded 24-hour — sorts/compares correctly as a plain
// string, mirrored on the backend (class-validator's @IsMilitaryTime()).
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm, e.g. 08:00");

function refineTimeOrder<T extends { startsAt: string; endsAt: string }>(schema: z.ZodType<T>) {
  return schema.refine((val) => val.startsAt < val.endsAt, {
    message: "Start time must be before end time.",
    path: ["endsAt"],
  });
}

export interface Period {
  id: string;
  schoolId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const periodInputSchema = refineTimeOrder(
  z.object({
    name: z.string().trim().min(1, "Name is required").max(100),
    startsAt: timeSchema,
    endsAt: timeSchema,
    sortOrder: z.coerce.number().int().min(0),
  }),
);
export type PeriodInput = z.infer<typeof periodInputSchema>;

export interface Break {
  id: string;
  schoolId: string;
  name: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
}

export const breakInputSchema = refineTimeOrder(
  z.object({
    name: z.string().trim().min(1, "Name is required").max(100),
    startsAt: timeSchema,
    endsAt: timeSchema,
  }),
);
export type BreakInput = z.infer<typeof breakInputSchema>;

export interface Holiday {
  id: string;
  schoolId: string;
  sessionId: string;
  termId: string | null;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

// Just the fields a form edits — sessionId/termId come from the caller
// (the selected session, a later term-picker step), not user input, same
// "form schema is a subset of the request schema" shape as grades.ts's
// evaluationFormSchema/CreateEvaluationInput.
export const holidayFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
  })
  .refine((val) => val.startDate <= val.endDate, {
    message: "Start date must be on or before the end date.",
    path: ["endDate"],
  });
export type HolidayFormInput = z.infer<typeof holidayFormSchema>;

export interface HolidayInput extends HolidayFormInput {
  sessionId: string;
  termId?: string | null;
}

// One row per class arm — Mon-Fri is implicit/fixed; the only knob is
// whether Saturday is also a school day. Sunday has no field at all (see
// ClassSchoolDays in schema.prisma) — nothing here can express it.
export interface ClassSchoolDays {
  classArmId: string;
  classArmName: string;
  classLevelName: string;
  includesSaturday: boolean;
}

export const setClassSchoolDaysInputSchema = z.object({
  includesSaturday: z.boolean(),
});
export type SetClassSchoolDaysInput = z.infer<typeof setClassSchoolDaysInputSchema>;

// v0.8 step 2 (SPEC_V0.8.md §7 item 2) — the repeating weekly timetable
// template. Deliberately six values, no SUNDAY — mirrors the backend's
// Weekday enum (schema.prisma), which has no SUNDAY member at all. This
// array is display/iteration order for the builder grid, not a validator;
// the structural guarantee lives in the Prisma enum + class-validator's
// @IsEnum(Weekday) on the backend, not here.
export const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
export type WeekdayValue = (typeof WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<WeekdayValue, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
};

// Denormalized for direct grid rendering — periodName/subjectName/
// teacherName come pre-joined from the API, no frontend N+1.
export interface TimetableSlot {
  id: string;
  classArmId: string;
  sessionId: string;
  dayOfWeek: WeekdayValue;
  periodId: string;
  periodName: string;
  subjectId: string;
  subjectName: string;
  teacherUserId: string;
  teacherName: string;
}

// The builder dialog's ONLY field is Subject — teacherUserId is derived
// from the class's existing subject-teacher assignment (ClassArmDetail.
// subjectTeachers, already fetched), never independently picked. The
// backend enforces exactly one teacher per (subject, classArm, session)
// anyway, so a separate teacher control could only ever construct a
// combination the backend guarantees will 400 — this removes that whole
// class of dead-end states, not just a convenience.
export const timetableSlotFormSchema = z.object({
  subjectId: z.string().uuid("Pick a subject"),
});
export type TimetableSlotFormInput = z.infer<typeof timetableSlotFormSchema>;

// classArmId/sessionId/dayOfWeek/periodId come from which grid cell was
// clicked (context, not user input) — same "form schema is a subset of
// the request schema" shape as HolidayInput/HolidayFormInput above.
// teacherUserId is the frontend's own lookup result, not typed by anyone.
export interface CreateTimetableSlotInput extends TimetableSlotFormInput {
  classArmId: string;
  sessionId: string;
  dayOfWeek: WeekdayValue;
  periodId: string;
  teacherUserId: string;
}

export interface UpdateTimetableSlotInput extends TimetableSlotFormInput {
  teacherUserId: string;
}

// v0.8 step 3 (SPEC_V0.8.md §7 item 3) — on-read composition: a resolved,
// day-by-day schedule for a date range. Computed on read, never
// materialized per-date. Includes SUNDAY (unlike WeekdayValue above,
// which deliberately excludes it) because a resolved calendar day still
// needs to report itself AS a Sunday, even though no slot can ever exist
// on one.
export const ANY_WEEKDAYS = [...WEEKDAYS, "SUNDAY"] as const;
export type AnyWeekdayValue = (typeof ANY_WEEKDAYS)[number];

export const ANY_WEEKDAY_LABELS: Record<AnyWeekdayValue, string> = { ...WEEKDAY_LABELS, SUNDAY: "Sunday" };

export type NonSchoolReason = "HOLIDAY" | "WEEKEND";

// v0.8 step 4 (SPEC_V0.8.md §4) — the exception overlay on a resolved
// period. null means "no exception, taught as scheduled." subjectId/
// subjectName/teacherUserId/teacherName above always stay the ORIGINAL
// slot's values, even when cancelled/replaced. note is populated only in
// the teacher's own view (GET /me/teaching-timetable) — the class/student/
// parent views never receive it.
export type TimetableExceptionStatus = "CANCELLED" | "REPLACED";

export interface ResolvedPeriodEntry {
  periodId: string;
  periodName: string;
  startsAt: string;
  endsAt: string;
  subjectId: string | null;
  subjectName: string | null;
  teacherUserId: string | null;
  teacherName: string | null;
  // Populated only in the teacher's cross-class view — a class view's
  // periods are all implicitly the caller's own class, so repeating it on
  // every row would be redundant.
  classArmId: string | null;
  className: string | null;
  status: TimetableExceptionStatus | null;
  exceptionId: string | null;
  note: string | null;
  replacementTeacherUserId: string | null;
  replacementTeacherName: string | null;
  replacementSubjectId: string | null;
  replacementSubjectName: string | null;
  activityLabel: string | null;
}

export interface ResolvedBreakEntry {
  breakId: string;
  name: string;
  startsAt: string;
  endsAt: string;
}

export interface ResolvedTimetableDay {
  date: string;
  dayOfWeek: AnyWeekdayValue;
  isSchoolDay: boolean;
  nonSchoolReason: NonSchoolReason | null;
  holidayName: string | null;
  periods: ResolvedPeriodEntry[];
  breaks: ResolvedBreakEntry[];
}

export interface ClassTimetableResponse {
  classArmId: string;
  className: string;
  from: string;
  to: string;
  days: ResolvedTimetableDay[];
}

export interface TeacherTimetableResponse {
  teacherUserId: string;
  from: string;
  to: string;
  days: ResolvedTimetableDay[];
}

// v0.8 step 4 (SPEC_V0.8.md §4) — teacher absence (auto-approved) +
// proprietor replacement, the exception layer laid on top of Step 2's
// repeating template. No classArmId anywhere here — the affected class is
// always resolved server-side from the caller's own TimetableSlot.

export interface TeacherAbsenceRow {
  id: string;
  teacherUserId: string;
  teacherName: string;
  date: string;
  // exceptionId links each period straight to PATCH
  // /calendar/timetable-exceptions/:id — every absence period was created
  // 1:1 with a TimetableException at absence-creation time.
  periods: { periodId: string; periodName: string; endsAt: string; classArmId: string; className: string; exceptionId: string; status: TimetableExceptionStatus }[];
  note: string;
  createdAt: string;
}

export const createTeacherAbsenceSchema = z.object({
  date: z.string().min(1, "Date is required"),
  periodIds: z.array(z.string().uuid()).min(1, "Pick at least one period"),
  note: z.string().trim().min(1, "A note is required").max(500),
});
export type CreateTeacherAbsenceInput = z.infer<typeof createTeacherAbsenceSchema>;

export type TimetableExceptionTypeValue = "CANCELLED_TEACHER_ABSENT" | "REPLACED";

export interface TimetableExceptionRow {
  id: string;
  classArmId: string;
  className: string;
  date: string;
  periodId: string;
  periodName: string;
  type: TimetableExceptionTypeValue;
  teacherUserId: string;
  teacherName: string;
  note: string | null;
  replacementTeacherUserId: string | null;
  replacementTeacherName: string | null;
  replacementSubjectId: string | null;
  replacementSubjectName: string | null;
  activityLabel: string | null;
}

// Replacement can be another teacher, a different subject/activity label,
// or both — all optional. Sending every field back to null/empty reverts
// the exception to CANCELLED (there is no delete). uuid().nullable() lets
// the "clear this field" case round-trip through the form as an explicit
// null rather than an absent key.
export const replaceTimetableExceptionSchema = z.object({
  replacementTeacherUserId: z.string().uuid().nullable().optional(),
  replacementSubjectId: z.string().uuid().nullable().optional(),
  activityLabel: z.string().trim().max(200).nullable().optional(),
});
export type ReplaceTimetableExceptionInput = z.infer<typeof replaceTimetableExceptionSchema>;

// v0.8.1 step 3 (SPEC_V0.8.1.md §2.8) — ONE rule, used by both the web
// (hides Replace/Edit replacement) and the API (rejects a late PATCH
// /calendar/timetable-exceptions/:id) so it can't drift between the two.
// `endsAt`, not `startsAt` — a period is only "passed" once fully over,
// not mid-lesson. Deliberately Date.UTC, not a local-timezone
// constructor: this runs in two different processes (a browser and a
// server) that could disagree on "local" time, which would be a worse bug
// than a fixed, known offset from true school wall-clock time. There's no
// per-school timezone anywhere in this system yet — this is a coarse
// "has this obviously already happened" gate, not a precise one.
export function isPeriodTimePast(date: string, endsAt: string, now: Date = new Date()): boolean {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = endsAt.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hours, minutes) < now.getTime();
}
