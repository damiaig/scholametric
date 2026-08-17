import { z } from "zod";

export const TERM_NAMES = ["FIRST", "SECOND", "THIRD"] as const;
export type TermNameValue = (typeof TERM_NAMES)[number];

export interface AcademicSession {
  id: string;
  schoolId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Term {
  id: string;
  schoolId: string;
  sessionId: string;
  name: TermNameValue;
  startsOn: string;
  endsOn: string;
  isCurrent: boolean;
  // SPEC_V0.5.md §2.3 (v0.5 step 1/3) — null = open. Set by a deliberate
  // principal/proprietor close action; there is no "reopen the whole
  // term" concept — editing a closed term happens per class-arm+subject
  // via TermUnlock below.
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// SPEC_V0.5.md §2.3/Q3 (v0.5 step 3) — one row per unlock/relock episode,
// not a flag. "Currently active" = relockedAt === null.
export interface TermUnlock {
  id: string;
  schoolId: string;
  termId: string;
  classArmId: string;
  subjectId: string;
  reason: string;
  unlockedBy: string;
  unlockedAt: string;
  relockedBy: string | null;
  relockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UnpublishedBreakdownRow {
  classArmId: string;
  subjectId: string;
  draftCount: number;
  pendingApprovalCount: number;
}

// POST /terms/:id/close's response (Q4 — warn-but-allow): the term row
// plus what's still unpublished, grouped. Ids only, no name joins — the
// caller already has its own classes/subjects lists to resolve names.
export interface CloseTermResponse extends Term {
  unpublishedCount: number;
  unpublished: UnpublishedBreakdownRow[];
}

export interface UnlockTermInput {
  classArmId: string;
  subjectId: string;
  reason: string;
}

export interface RelockTermInput {
  classArmId: string;
  subjectId: string;
}

// ClassLevel/ClassArm are already exported from ./students (the trimmed
// shape used by Student.currentEnrollment) — reused here rather than
// redeclared to avoid an ambiguous-export collision.

// GET /sessions/:id/activation-preview (v0.2 §2) — currentSession is null
// if the school has no current session yet.
export interface ActivationPreview {
  targetSession: { name: string; enrollmentCount: number };
  currentSession: { name: string; enrollmentCount: number } | null;
}

const dateOnly = z.string().min(1, "Date is required");

export const createSessionSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    startsOn: dateOnly,
    endsOn: dateOnly,
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "End date must be on or after the start date",
    path: ["endsOn"],
  });
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const createTermSchema = z
  .object({
    sessionId: z.string().min(1, "Select a session"),
    name: z.enum(TERM_NAMES, { message: "Select a term" }),
    startsOn: dateOnly,
    endsOn: dateOnly,
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "End date must be on or after the start date",
    path: ["endsOn"],
  });
export type CreateTermInput = z.infer<typeof createTermSchema>;

export const createClassLevelSchema = z.object({
  name: z.string().min(1, "Name is required"),
  rank: z.coerce.number().int("Rank must be a whole number"),
});
export type CreateClassLevelInput = z.infer<typeof createClassLevelSchema>;

export const updateClassLevelSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  rank: z.coerce.number().int("Rank must be a whole number").optional(),
});
export type UpdateClassLevelInput = z.infer<typeof updateClassLevelSchema>;

export const createClassArmSchema = z.object({
  name: z.string().min(1, "Name is required"),
  classLevelId: z.string().min(1, "Select a class level"),
});
export type CreateClassArmInput = z.infer<typeof createClassArmSchema>;

export const updateClassArmSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  classLevelId: z.string().min(1, "Select a class level").optional(),
});
export type UpdateClassArmInput = z.infer<typeof updateClassArmSchema>;
