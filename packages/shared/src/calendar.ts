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
