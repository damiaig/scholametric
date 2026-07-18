import type { ClassLevelOverview } from "@scholametric/shared";

export interface ClassTeacherOfBadge {
  armId: string;
  label: string;
}

/** teacherUserId -> arms ("JSS 1 A", id) they're the current-session class teacher of. */
export function buildClassTeacherMap(levels: ClassLevelOverview[] | undefined): Map<string, ClassTeacherOfBadge[]> {
  const map = new Map<string, ClassTeacherOfBadge[]>();
  for (const level of levels ?? []) {
    for (const arm of level.arms) {
      if (!arm.classTeacher) continue;
      const badge = { armId: arm.id, label: `${level.name} ${arm.name}` };
      const existing = map.get(arm.classTeacher.userId);
      if (existing) {
        existing.push(badge);
      } else {
        map.set(arm.classTeacher.userId, [badge]);
      }
    }
  }
  return map;
}
