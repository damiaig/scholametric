// SPEC_V0.6.md §2.2 — pure, DB-free helpers for the family-coding algorithm.
// Kept separate from PortalAccountsService so the coding rules themselves
// (grouping, stems, letter escalation, digit parsing) are unit-testable
// without a database.

export interface FamilyMember {
  id: string;
  admissionNumber: string;
}

/** One connected component of the student<->guardian graph — a "family". */
export interface Family<T extends FamilyMember> {
  members: T[];
}

/**
 * Groups students into families by connected components over shared
 * guardian links — NOT by surname text (SPEC_V0.6.md §2.2, §4). Two
 * students are the same family iff they share at least one guardian, any
 * relationship, any isPrimary value. A student with no guardian links at
 * all forms a family of one (the patchy-data fallback).
 */
export function groupIntoFamilies<T extends FamilyMember>(
  students: T[],
  studentGuardianLinks: Array<{ studentId: string; guardianId: string }>,
): Family<T>[] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // Path compression.
    let current = id;
    while (parent.get(current) !== undefined && parent.get(current) !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  for (const student of students) parent.set(student.id, student.id);

  const guardianToStudents = new Map<string, string[]>();
  for (const link of studentGuardianLinks) {
    const list = guardianToStudents.get(link.guardianId) ?? [];
    list.push(link.studentId);
    guardianToStudents.set(link.guardianId, list);
  }
  for (const studentIds of guardianToStudents.values()) {
    for (let i = 1; i < studentIds.length; i++) {
      union(studentIds[0], studentIds[i]);
    }
  }

  const byRoot = new Map<string, T[]>();
  for (const student of students) {
    const root = find(student.id);
    const list = byRoot.get(root) ?? [];
    list.push(student);
    byRoot.set(root, list);
  }

  return [...byRoot.values()].map((members) => ({
    // Deterministic member order within a family — lowest admission number
    // first — so "anchor student" resolution is stable across runs.
    members: [...members].sort((a, b) => a.admissionNumber.localeCompare(b.admissionNumber)),
  }));
}

/** Strips a surname down to a safe A-Z username stem. Falls back if that leaves nothing (non-alphabetic surname). */
export function surnameToStem(lastName: string): string {
  const stem = lastName.toUpperCase().replace(/[^A-Z]/g, "");
  return stem || "FAMILY";
}

/**
 * The escalating collision suffix (SPEC_V0.6.md §2.2): 1st collision -> B,
 * 2nd -> C, ... 25th -> Z, 26th -> AA, 27th -> AB, ... A standard
 * spreadsheet-column sequence (A, B, ..., Z, AA, AB, ...) shifted by one
 * slot, since the bare stem already occupies the "A" position.
 */
export function collisionLetterSuffix(collisionIndex: number): string {
  let n = collisionIndex + 1;
  let result = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

/**
 * Next free family code for a brand-new family: bare stem, then stem+B,
 * stem+C, ... until a candidate isn't in existingUsernames (case-
 * insensitive — usernames are Citext). This is guarantee #2 from
 * SPEC_V0.6.md §2.2 (a final free-name check), not just "by construction".
 */
export function nextFreeFamilyCode(stem: string, existingUsernamesUpper: Set<string>): string {
  let candidate = stem;
  let collisionIndex = 0;
  while (existingUsernamesUpper.has(candidate.toUpperCase())) {
    candidate = `${stem}${collisionLetterSuffix(collisionIndex)}`;
    collisionIndex++;
  }
  return candidate;
}

/**
 * The next free per-family sibling digit, ANCHORED to this exact family
 * code — `^${familyCode}[0-9]+$`, not a startsWith — so e.g. OKAFOR's next
 * digit is never computed from OKAFORB's OKAFORB1/OKAFORB2 usernames.
 * (Watch-item: an un-anchored prefix match would let an unrelated,
 * letter-escalated family's siblings leak into this family's numbering.)
 */
export function nextSiblingDigit(familyCode: string, existingUsernamesUpper: string[]): number {
  const pattern = new RegExp(`^${familyCode.toUpperCase()}([0-9]+)$`);
  let max = 0;
  for (const username of existingUsernamesUpper) {
    const match = pattern.exec(username.toUpperCase());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

/** Strips trailing digits to recover a family code from an existing student username (e.g. "OKAFOR12" -> "OKAFOR"). */
export function stripTrailingDigits(username: string): string {
  return username.replace(/[0-9]+$/, "");
}
