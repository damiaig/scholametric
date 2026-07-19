import { Injectable } from "@nestjs/common";
import { StudentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../common/tenant/tenant-context";
import { forSchool } from "../common/tenant/for-school";

interface StudentsByLevelRow {
  levelName: string;
  rank: number;
  count: bigint;
}

export interface DashboardStats {
  totalActiveStudents: number;
  studentsByLevel: { levelName: string; rank: number; count: number }[];
  currentSession: string | null;
  currentTerm: string | null;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  async stats(): Promise<DashboardStats> {
    const schoolId = this.tenantContext.schoolId;

    const currentSession = await this.prisma.academicSession.findFirst({
      where: forSchool(schoolId, { isCurrent: true }),
    });

    // A brand-new school with no session yet has nothing to enroll students
    // into, so there's nothing meaningful to group by level either.
    //
    // totalActiveStudents is scoped to the CURRENT session's enrollments,
    // matching studentsByLevel — not a school-wide count. A school-wide
    // count would never reach 0 right after activating a freshly-created
    // session, silently defeating the empty-session banner (SPEC_V0.2.md
    // §4) that this stat drives on the frontend. See docs/DECISIONS.md.
    const [totalActiveStudents, currentTerm, studentsByLevel] = await Promise.all([
      currentSession
        ? this.prisma.student.count({
            where: forSchool(schoolId, {
              status: StudentStatus.ACTIVE,
              enrollments: { some: { sessionId: currentSession.id } },
            }),
          })
        : 0,
      currentSession
        ? this.prisma.term.findFirst({ where: forSchool(schoolId, { sessionId: currentSession.id, isCurrent: true }) })
        : null,
      currentSession ? this.studentsByLevel(schoolId, currentSession.id) : Promise.resolve([]),
    ]);

    return {
      totalActiveStudents,
      studentsByLevel,
      currentSession: currentSession?.name ?? null,
      currentTerm: currentTerm?.name ?? null,
    };
  }

  // One grouped query instead of one count per class level — matters once a
  // school has a dozen+ levels/arms.
  private async studentsByLevel(schoolId: string, sessionId: string) {
    const rows = await this.prisma.$queryRaw<StudentsByLevelRow[]>`
      SELECT cl.name AS "levelName", cl.rank AS rank, COUNT(*)::bigint AS count
      FROM students s
      JOIN student_enrollments se ON se.student_id = s.id AND se.session_id = ${sessionId}::uuid
      JOIN class_arms ca ON ca.id = se.class_arm_id
      JOIN class_levels cl ON cl.id = ca.class_level_id
      WHERE s.school_id = ${schoolId}::uuid
        AND s.status = 'ACTIVE'
        AND s.deleted_at IS NULL
      GROUP BY cl.id, cl.name, cl.rank
      ORDER BY cl.rank ASC
    `;
    return rows.map((row) => ({ levelName: row.levelName, rank: row.rank, count: Number(row.count) }));
  }
}
