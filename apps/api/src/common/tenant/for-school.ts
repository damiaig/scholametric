/**
 * Merges a tenant scope into a Prisma `where` clause. Domain modules
 * must use this instead of hand-rolling `{ schoolId }` so that every
 * tenant-scoped query goes through one seam (CLAUDE.md §4).
 */
export function forSchool<T extends object>(
  schoolId: string,
  where: T = {} as T,
): T & { schoolId: string } {
  return { ...where, schoolId };
}
