import { z } from "zod";

// Mirrors apps/api/src/assessment-components + grade-boundaries (v0.3
// step 2) — both endpoints already exist and are unchanged by this file.
// This is a deliberate MIRROR of the backend's validation rules, not a
// single shared source: the backend validates with class-validator DTOs +
// plain service methods (BadRequestException), the frontend needs live,
// per-keystroke feedback with per-row highlighting, which needs a
// different shape of result entirely. Porting the same RULES here (sum
// must be exactly 100, tiling 0-100 with no gaps/overlaps, etc.) instead
// of re-deriving them ad hoc keeps the two implementations honest without
// forcing an artificial single-codebase abstraction across a REST
// boundary between two different validation paradigms (CLAUDE.md §6).
// If the backend's rules ever change, this file must be updated to match
// — there is no compiler/test link between the two, only this comment.

export const ASSESSMENT_COMPONENTS_MIN = 1;
export const ASSESSMENT_COMPONENTS_MAX = 8;
export const GRADE_BOUNDARIES_MIN = 2;
export const GRADE_BOUNDARIES_MAX = 12;

export interface AssessmentComponent {
  id: string;
  schoolId: string;
  name: string;
  weight: number;
  sortOrder: number;
  // v0.5 acceptance-walk fix: this was missing from the mirror entirely,
  // which is how AssessmentStructurePanel shipped never round-tripping it
  // in the first place (see assessmentComponentItemSchema below).
  requiresApproval: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// requiresApproval is REQUIRED here (unlike the backend DTO's @IsOptional,
// which exists for other API consumers) — the form always has a definite
// boolean per row via the checkbox below, and making it required is what
// stops a future edit from silently omitting it again the way this
// shipped originally (v0.5 acceptance-walk finding #1, docs/DECISIONS.md).
export const assessmentComponentItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  weight: z.coerce.number().int("Weight must be a whole number").min(1, "Weight must be at least 1"),
  sortOrder: z.coerce.number().int().min(0),
  requiresApproval: z.boolean(),
});
export type AssessmentComponentItemInput = z.infer<typeof assessmentComponentItemSchema>;

export interface AssessmentComponentsValidation {
  isValid: boolean;
  totalWeight: number;
  error?: string;
}

// Mirrors AssessmentComponentsService.validate() (apps/api/src/
// assessment-components/assessment-components.service.ts).
export function validateAssessmentComponentsSet(
  items: AssessmentComponentItemInput[],
): AssessmentComponentsValidation {
  const totalWeight = items.reduce((sum, item) => sum + (Number.isFinite(item.weight) ? item.weight : 0), 0);

  if (items.length < ASSESSMENT_COMPONENTS_MIN) {
    return { isValid: false, totalWeight, error: `At least ${ASSESSMENT_COMPONENTS_MIN} component is required.` };
  }
  if (items.length > ASSESSMENT_COMPONENTS_MAX) {
    return { isValid: false, totalWeight, error: `At most ${ASSESSMENT_COMPONENTS_MAX} components are allowed.` };
  }
  if (totalWeight !== 100) {
    return { isValid: false, totalWeight, error: `Weights must sum to exactly 100 (currently ${totalWeight}).` };
  }
  const names = items.map((item) => item.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    return { isValid: false, totalWeight, error: "Component names must be unique." };
  }
  // Mirrors AssessmentComponentsService.validate()'s gap-1/Q7 rule exactly
  // (same message) — catching this client-side before the round trip is
  // the whole point of the fix: a save that would 400 anyway is blocked
  // with a clear reason instead of every edit failing opaquely.
  if (!items.some((item) => item.requiresApproval === true)) {
    return {
      isValid: false,
      totalWeight,
      error: "At least one component must require approval, or results can never be published.",
    };
  }
  return { isValid: true, totalWeight };
}

export interface GradeBoundary {
  id: string;
  schoolId: string;
  grade: string;
  minScore: number;
  maxScore: number;
  remark: string;
  sortOrder: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const gradeBoundaryItemSchema = z.object({
  grade: z.string().min(1, "Grade is required"),
  minScore: z.coerce.number().int("Must be a whole number").min(0).max(100),
  maxScore: z.coerce.number().int("Must be a whole number").min(0).max(100),
  remark: z.string().min(1, "Remark is required"),
  sortOrder: z.coerce.number().int().min(0),
});
export type GradeBoundaryItemInput = z.infer<typeof gradeBoundaryItemSchema>;

export interface GradeBoundariesValidation {
  isValid: boolean;
  error?: string;
  /** Row keys (caller-supplied, e.g. a local id) implicated in the error, for highlighting. */
  invalidKeys: Set<string>;
}

// Mirrors GradeBoundariesService.validate() (apps/api/src/grade-boundaries/
// grade-boundaries.service.ts). `keyOf` lets the caller supply a stable
// per-row key (server rows have `id`; new unsaved rows don't) so offending
// rows can be highlighted without relying on array index, which shifts
// when rows are added/removed/reordered.
export function validateGradeBoundariesSet<T extends GradeBoundaryItemInput>(
  items: T[],
  keyOf: (item: T) => string,
): GradeBoundariesValidation {
  const noHighlight = new Set<string>();

  if (items.length < GRADE_BOUNDARIES_MIN) {
    return { isValid: false, error: `At least ${GRADE_BOUNDARIES_MIN} grade boundaries are required.`, invalidKeys: noHighlight };
  }
  if (items.length > GRADE_BOUNDARIES_MAX) {
    return { isValid: false, error: `At most ${GRADE_BOUNDARIES_MAX} grade boundaries are allowed.`, invalidKeys: noHighlight };
  }

  for (const item of items) {
    if (item.minScore > item.maxScore) {
      return {
        isValid: false,
        error: `"${item.grade}"'s minimum score cannot exceed its maximum.`,
        invalidKeys: new Set([keyOf(item)]),
      };
    }
  }

  const byGrade = new Map<string, string[]>();
  items.forEach((item) => {
    const g = item.grade.trim().toLowerCase();
    byGrade.set(g, [...(byGrade.get(g) ?? []), keyOf(item)]);
  });
  const duplicateKeys = new Set([...byGrade.values()].filter((keys) => keys.length > 1).flat());
  if (duplicateKeys.size > 0) {
    return { isValid: false, error: "Grades must be unique.", invalidKeys: duplicateKeys };
  }

  const sorted = [...items].sort((a, b) => a.minScore - b.minScore);
  if (sorted[0].minScore !== 0) {
    return { isValid: false, error: "The lowest boundary must start at 0.", invalidKeys: new Set([keyOf(sorted[0])]) };
  }
  if (sorted[sorted.length - 1].maxScore !== 100) {
    return {
      isValid: false,
      error: "The highest boundary must end at 100.",
      invalidKeys: new Set([keyOf(sorted[sorted.length - 1])]),
    };
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (curr.minScore < prev.maxScore + 1) {
      return {
        isValid: false,
        error: `"${prev.grade}" (${prev.minScore}-${prev.maxScore}) and "${curr.grade}" (${curr.minScore}-${curr.maxScore}) overlap.`,
        invalidKeys: new Set([keyOf(prev), keyOf(curr)]),
      };
    }
    if (curr.minScore > prev.maxScore + 1) {
      return {
        isValid: false,
        error: `There's a gap between ${prev.maxScore} and ${curr.minScore}.`,
        invalidKeys: new Set([keyOf(prev), keyOf(curr)]),
      };
    }
  }

  return { isValid: true, invalidKeys: noHighlight };
}

export interface GradingPresetRow {
  grade: string;
  minScore: number;
  maxScore: number;
  remark: string;
  sortOrder: number;
}

export interface GradingPresets {
  waec9Point: GradingPresetRow[];
  simpleAToF: GradingPresetRow[];
}
