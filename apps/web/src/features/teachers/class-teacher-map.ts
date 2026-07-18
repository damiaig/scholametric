import type { ClassLevelOverview } from "@scholametric/shared";

/** teacherUserId -> class labels ("JSS 1 A") they're the current-session class teacher of. */
export function buildClassTeacherMap(levels: ClassLevelOverview[] | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const level of levels ?? []) {
    for (const arm of level.arms) {
      if (!arm.classTeacher) continue;
      const label = `${level.name} ${arm.name}`;
      const existing = map.get(arm.classTeacher.userId);
      if (existing) {
        existing.push(label);
      } else {
        map.set(arm.classTeacher.userId, [label]);
      }
    }
  }
  return map;
}
