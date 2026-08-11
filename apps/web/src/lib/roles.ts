import type { UserRole } from "@scholametric/shared";

/**
 * PROPRIETOR and SCHOOL_ADMIN have identical full access everywhere in this
 * app (SPEC_V0.2.md §4) — one helper instead of repeating the two-role
 * check at every call site, which is how the pre-v0.2 SCHOOL_ADMIN-only
 * checks (students management, Settings) missed PROPRIETOR entirely when
 * that role was added. See docs/DECISIONS.md.
 */
export function isSchoolAdmin(role: UserRole | undefined): boolean {
  return role === "PROPRIETOR" || role === "SCHOOL_ADMIN";
}

/**
 * Owner-only actions (SPEC_V0.4.md §2: force-unpublish a result, override a
 * grade on an already-published result) — the first place PROPRIETOR and
 * SCHOOL_ADMIN diverge in this app. Mirrors isSchoolAdmin()'s shape so
 * call sites don't scatter raw `role === "PROPRIETOR"` checks.
 */
export function isProprietor(role: UserRole | undefined): boolean {
  return role === "PROPRIETOR";
}
