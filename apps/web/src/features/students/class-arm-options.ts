import type { ClassArm, ClassLevel } from "@scholametric/shared";

export interface ClassArmOption {
  value: string;
  label: string;
}

/** Joins class-arms to their class-level (the API doesn't nest this on GET /class-arms) into "JSS 2 A" style labels, ordered by level rank then arm name. */
export function buildClassArmOptions(classLevels: ClassLevel[], classArms: ClassArm[]): ClassArmOption[] {
  const levelById = new Map(classLevels.map((level) => [level.id, level]));

  return classArms
    .map((arm) => {
      const level = levelById.get(arm.classLevelId);
      return {
        value: arm.id,
        label: level ? `${level.name} ${arm.name}` : arm.name,
        rank: level?.rank ?? Number.MAX_SAFE_INTEGER,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
    .map(({ value, label }) => ({ value, label }));
}
