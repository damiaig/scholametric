import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { resolveTeacherArmIds } from "../grades/teacher-access.util";

interface ClassesRow {
  levelId: string;
  levelName: string;
  levelRank: number;
  armId: string;
  armName: string;
  enrollmentCount: number;
  teacherUserId: string | null;
  teacherFirstName: string | null;
  teacherLastName: string | null;
}

export interface ClassesArmSummary {
  id: string;
  name: string;
  enrollmentCount: number;
  classTeacher: { userId: string; firstName: string; lastName: string } | null;
}

export interface ClassesLevelSummary {
  id: string;
  name: string;
  rank: number;
  arms: ClassesArmSummary[];
}

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  // ONE query total (SPEC_V0.2.md §2/§5) — the current session is resolved
  // in a CTE rather than a separate round-trip, then joined against
  // enrollments/class-teacher assignments and grouped. A school with no
  // current session yet still returns every level/arm, just with
  // enrollmentCount 0 and classTeacher null (the CTE returns no rows, so
  // every session-scoped join condition compares against NULL and never
  // matches — not a special case in the SQL).
  //
  // SPEC_V0.5.1.md §2.4/v0.5.1 step 2: SCHOOL_ADMIN/PROPRIETOR fall
  // through unchanged (same query, same response, as before this step —
  // an early return, not a scope parameter threaded through the query
  // above). TEACHER gets the tree filtered to arms they're the class-
  // teacher of or hold a subject assignment in this session — the exact
  // same relationship resolveTeacherAccess uses for grade-read access
  // (resolveTeacherArmIds is its "list every arm" counterpart), so this
  // can't drift from the grade-access rule. Levels left with zero visible
  // arms after filtering are dropped, not shown empty.
  async findAll(user: AuthenticatedUser): Promise<ClassesLevelSummary[]> {
    const schoolId = this.tenantContext.schoolId;

    const rows = await this.prisma.$queryRaw<ClassesRow[]>`
      WITH current_session AS (
        SELECT id FROM academic_sessions
        WHERE school_id = ${schoolId}::uuid AND is_current = true
        LIMIT 1
      )
      SELECT
        cl.id AS "levelId", cl.name AS "levelName", cl.rank AS "levelRank",
        ca.id AS "armId", ca.name AS "armName",
        COUNT(DISTINCT se.student_id)::int AS "enrollmentCount",
        cta.teacher_user_id AS "teacherUserId",
        u.first_name AS "teacherFirstName",
        u.last_name AS "teacherLastName"
      FROM class_levels cl
      JOIN class_arms ca ON ca.class_level_id = cl.id
      LEFT JOIN student_enrollments se
        ON se.class_arm_id = ca.id AND se.session_id = (SELECT id FROM current_session)
      LEFT JOIN class_teacher_assignments cta
        ON cta.class_arm_id = ca.id AND cta.session_id = (SELECT id FROM current_session)
      LEFT JOIN users u ON u.id = cta.teacher_user_id
      WHERE cl.school_id = ${schoolId}::uuid
      GROUP BY cl.id, cl.name, cl.rank, ca.id, ca.name, cta.teacher_user_id, u.first_name, u.last_name
      ORDER BY cl.rank ASC, ca.name ASC
    `;

    const levelsById = new Map<string, ClassesLevelSummary>();
    for (const row of rows) {
      let level = levelsById.get(row.levelId);
      if (!level) {
        level = { id: row.levelId, name: row.levelName, rank: row.levelRank, arms: [] };
        levelsById.set(row.levelId, level);
      }
      level.arms.push({
        id: row.armId,
        name: row.armName,
        enrollmentCount: row.enrollmentCount,
        classTeacher: row.teacherUserId
          ? { userId: row.teacherUserId, firstName: row.teacherFirstName!, lastName: row.teacherLastName! }
          : null,
      });
    }

    const levels = [...levelsById.values()].sort((a, b) => a.rank - b.rank);

    if (user.role !== UserRole.TEACHER) {
      return levels;
    }

    const currentSession = await this.prisma.academicSession.findFirst({ where: forSchool(schoolId, { isCurrent: true }) });
    const armIds = currentSession
      ? await resolveTeacherArmIds(this.prisma, { schoolId, teacherUserId: user.userId, sessionId: currentSession.id })
      : new Set<string>();

    return levels
      .map((level) => ({ ...level, arms: level.arms.filter((arm) => armIds.has(arm.id)) }))
      .filter((level) => level.arms.length > 0);
  }
}
