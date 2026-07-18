import { z } from "zod";

export const GUARDIAN_RELATIONSHIPS = [
  "FATHER",
  "MOTHER",
  "STEPFATHER",
  "STEPMOTHER",
  "GRANDPARENT",
  "UNCLE",
  "AUNT",
  "SIBLING",
  "LEGAL_GUARDIAN",
  "OTHER",
] as const;
export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number];

export const GUARDIAN_RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  FATHER: "Father",
  MOTHER: "Mother",
  STEPFATHER: "Stepfather",
  STEPMOTHER: "Stepmother",
  GRANDPARENT: "Grandparent",
  UNCLE: "Uncle",
  AUNT: "Aunt",
  SIBLING: "Sibling",
  LEGAL_GUARDIAN: "Legal guardian",
  OTHER: "Other",
};

export interface StudentGuardianSummary {
  id: string;
  guardianId: string;
  relationship: GuardianRelationship;
  isPrimary: boolean;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  address: string | null;
}

interface GuardianEntryLike {
  mode: "existing" | "new";
  guardianId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  relationship?: GuardianRelationship | "";
}

// Shared by both addGuardianSchema below and CreateStudentDto's per-entry
// guardian schema in students.ts — same two-mode shape (link existing vs
// create new), just with an extra isPrimary field at creation time. Kept as
// a plain function (not baked into one schema both extend) since zod's
// `.superRefine` wraps a schema in a way that isn't cleanly `.extend()`-able
// afterward.
//
// `relationship` is validated here too (not as a required z.enum() on the
// base object) — a required enum with an undefined value produces an
// "aborted" zod parse status, which skips superRefine entirely, hiding
// every other error in the entry (whack-a-mole UX). Keeping every
// requiredness check inside this one refinement means one entry always
// reports all of its errors together.
export function validateGuardianEntry(value: GuardianEntryLike, ctx: z.RefinementCtx): void {
  if (!value.relationship) {
    ctx.addIssue({ code: "custom", message: "Select a relationship", path: ["relationship"] });
  }
  if (value.mode === "existing" && !value.guardianId) {
    ctx.addIssue({ code: "custom", message: "Select a guardian to link", path: ["guardianId"] });
  }
  if (value.mode === "new") {
    if (!value.firstName) ctx.addIssue({ code: "custom", message: "First name is required", path: ["firstName"] });
    if (!value.lastName) ctx.addIssue({ code: "custom", message: "Last name is required", path: ["lastName"] });
    if (!value.phone) ctx.addIssue({ code: "custom", message: "Phone is required", path: ["phone"] });
    if (value.email) {
      const emailCheck = z.string().email().safeParse(value.email);
      if (!emailCheck.success) {
        ctx.addIssue({ code: "custom", message: "Enter a valid email address", path: ["email"] });
      }
    }
  }
}

// Two modes, same as the backend's AddStudentGuardianDto: link an existing
// guardian by id (the sibling case — found by searching the sibling
// student, then picking one of their guardians; see docs/DECISIONS.md for
// why there's no direct guardian search) or create a new one. No
// `isPrimary` here — matches the backend's own deliberate omission: adding
// a guardian to a student who already has one never steals primary.
// relationship accepts "" alongside the real enum values (not just
// .optional()) — a native <select>'s placeholder option submits "" through
// react-hook-form's uncontrolled `register`, not `undefined`. A bare
// `z.enum(...).optional()` rejects "" as an invalid enum value, which
// aborts this object's parse and skips validateGuardianEntry entirely,
// hiding every other error in the entry (see docs/DECISIONS.md).
export const relationshipFieldSchema = z.union([z.enum(GUARDIAN_RELATIONSHIPS), z.literal("")]).optional();

export const addGuardianSchema = z
  .object({
    mode: z.enum(["existing", "new"]),
    guardianId: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
    relationship: relationshipFieldSchema,
  })
  .superRefine(validateGuardianEntry);
export type AddGuardianInput = z.infer<typeof addGuardianSchema>;

export const editGuardianSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Enter a valid email address").optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
});
export type EditGuardianInput = z.infer<typeof editGuardianSchema>;
