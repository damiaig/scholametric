import { PrismaClient, SchoolType, UserRole, TermName, Gender, JobTitle, GuardianRelationship } from "@prisma/client";
import bcrypt from "bcrypt";
import {
  computeSubjectTotal,
  computeSubjectStatus,
  computeOverallStatus,
  computeOverallAverage,
  computeStandardCompetitionRanking,
  resolveGradeBand,
  type ComponentInput,
  type GradeBoundaryInput,
  type ResultStatus,
} from "../src/grades/grade-computation";

const prisma = new PrismaClient();
const BCRYPT_COST = 12;
const SEED_PASSWORD = "Passw0rd!";

function hash(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

interface StudentSeed {
  firstName: string;
  lastName: string;
  gender: Gender;
}

const SUNRISE_STUDENTS: StudentSeed[] = [
  { firstName: "Oluwaseun", lastName: "Adeyemi", gender: Gender.MALE },
  { firstName: "Chiamaka", lastName: "Okafor", gender: Gender.FEMALE },
  { firstName: "Ibrahim", lastName: "Mohammed", gender: Gender.MALE },
  { firstName: "Ngozi", lastName: "Eze", gender: Gender.FEMALE },
  { firstName: "Emeka", lastName: "Nwosu", gender: Gender.MALE },
  { firstName: "Aisha", lastName: "Bello", gender: Gender.FEMALE },
  { firstName: "Tunde", lastName: "Adebayo", gender: Gender.MALE },
  { firstName: "Blessing", lastName: "Okonkwo", gender: Gender.FEMALE },
  { firstName: "Yusuf", lastName: "Abdullahi", gender: Gender.MALE },
  { firstName: "Folake", lastName: "Ogunleye", gender: Gender.FEMALE },
  { firstName: "Chidi", lastName: "Okoro", gender: Gender.MALE },
  { firstName: "Amina", lastName: "Sani", gender: Gender.FEMALE },
  { firstName: "Segun", lastName: "Alabi", gender: Gender.MALE },
  { firstName: "Chioma", lastName: "Nnamdi", gender: Gender.FEMALE },
  { firstName: "Musa", lastName: "Garba", gender: Gender.MALE },
  { firstName: "Temitope", lastName: "Fashola", gender: Gender.FEMALE },
  { firstName: "Uche", lastName: "Obi", gender: Gender.MALE },
  { firstName: "Hauwa", lastName: "Usman", gender: Gender.FEMALE },
  { firstName: "Kayode", lastName: "Ojo", gender: Gender.MALE },
  { firstName: "Adaeze", lastName: "Chukwu", gender: Gender.FEMALE },
  { firstName: "Sani", lastName: "Yakubu", gender: Gender.MALE },
  { firstName: "Bimpe", lastName: "Adewale", gender: Gender.FEMALE },
  { firstName: "Chukwuemeka", lastName: "Eze", gender: Gender.MALE },
  { firstName: "Fatima", lastName: "Lawal", gender: Gender.FEMALE },
  { firstName: "Wale", lastName: "Akintola", gender: Gender.MALE },
];

const HILLCREST_STUDENTS: StudentSeed[] = [
  { firstName: "Chinedu", lastName: "Onyekwere", gender: Gender.MALE },
  { firstName: "Zainab", lastName: "Muhammad", gender: Gender.FEMALE },
  { firstName: "Femi", lastName: "Ogundipe", gender: Gender.MALE },
  { firstName: "Ijeoma", lastName: "Anyanwu", gender: Gender.FEMALE },
  { firstName: "Abdulrahman", lastName: "Sule", gender: Gender.MALE },
];

// Nigerian class sizes average 51, up to 101+ in some regions (North-West) —
// one large JSS 2 A class at Sunrise gives the frontend a realistic
// performance test bed from step 7 onward. See docs/DECISIONS.md.
const BULK_CLASS_SIZE = 100;
const BULK_CLASS_STARTING_SEQUENCE = 26; // continues after SUNRISE_STUDENTS' 1–25

const MALE_FIRST_NAMES = [
  "Adebayo", "Chukwuemeka", "Ibrahim", "Oluwadamilare", "Emeka", "Tunde", "Kunle", "Segun", "Yusuf", "Chidi",
  "Uche", "Kayode", "Sani", "Wale", "Femi", "Abdullahi", "Ikenna", "Damilola", "Habib", "Gbenga",
];
const FEMALE_FIRST_NAMES = [
  "Chiamaka", "Ngozi", "Aisha", "Blessing", "Folake", "Amina", "Chioma", "Temitope", "Hauwa", "Adaeze",
  "Bimpe", "Fatima", "Ifeoma", "Zainab", "Halima", "Yetunde", "Nkechi", "Rukayat", "Omolara", "Adaobi",
];
const SURNAMES = [
  "Okafor", "Mohammed", "Eze", "Nwosu", "Bello", "Adebayo", "Okonkwo", "Abdullahi", "Ogunleye", "Okoro",
  "Sani", "Alabi", "Nnamdi", "Garba", "Fashola", "Obi", "Usman", "Ojo", "Chukwu", "Yakubu",
  "Adewale", "Lawal", "Akintola", "Musa", "Danjuma",
];

function generateBulkClassStudents(count: number): StudentSeed[] {
  return Array.from({ length: count }, (_, i) => {
    const isMale = i % 2 === 0;
    const firstNames = isMale ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;
    return {
      firstName: firstNames[i % firstNames.length],
      lastName: SURNAMES[(i + Math.floor(i / firstNames.length)) % SURNAMES.length],
      gender: isMale ? Gender.MALE : Gender.FEMALE,
    };
  });
}

const CLASS_LEVELS = [
  { name: "JSS 1", rank: 1 },
  { name: "JSS 2", rank: 2 },
  { name: "JSS 3", rank: 3 },
  { name: "SSS 1", rank: 4 },
  { name: "SSS 2", rank: 5 },
  { name: "SSS 3", rank: 6 },
];
const ARMS = ["A", "B"];
const ARM_KEYS = CLASS_LEVELS.flatMap((level) => ARMS.map((arm) => `${level.name}-${arm}`));

const CURRENT_SESSION_NAME = "2026/2027";

const JSS_LEVEL_NAMES = ["JSS 1", "JSS 2", "JSS 3"];
const SSS_LEVEL_NAMES = ["SSS 1", "SSS 2", "SSS 3"];

interface StaffSeed {
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: JobTitle;
  qualification: string;
  phone: string;
}

// SPEC_V0.2.md §3: 8 teachers at Sunrise, including the pre-existing
// teacher@sunrise.test (kept first so its login/e2e usage is unchanged).
const SUNRISE_TEACHERS: StaffSeed[] = [
  { email: "teacher@sunrise.test", firstName: "Bola", lastName: "Ogundare", jobTitle: JobTitle.TEACHER, qualification: "B.Ed Mathematics", phone: "+2348030000001" },
  { email: "teacher2@sunrise.test", firstName: "Ngozi", lastName: "Chukwuma", jobTitle: JobTitle.TEACHER, qualification: "B.Sc Ed. English Language", phone: "+2348030000002" },
  { email: "teacher3@sunrise.test", firstName: "Ahmed", lastName: "Suleiman", jobTitle: JobTitle.TEACHER, qualification: "B.Sc Physics", phone: "+2348030000003" },
  { email: "teacher4@sunrise.test", firstName: "Ifeoma", lastName: "Anozie", jobTitle: JobTitle.TEACHER, qualification: "B.Sc Chemistry", phone: "+2348030000004" },
  { email: "teacher5@sunrise.test", firstName: "Tunde", lastName: "Bakare", jobTitle: JobTitle.TEACHER, qualification: "B.Sc Biology", phone: "+2348030000005" },
  { email: "teacher6@sunrise.test", firstName: "Halima", lastName: "Yusuf", jobTitle: JobTitle.TEACHER, qualification: "B.A Economics", phone: "+2348030000006" },
  { email: "teacher7@sunrise.test", firstName: "Emeka", lastName: "Obiora", jobTitle: JobTitle.TEACHER, qualification: "B.Ed Social Studies", phone: "+2348030000007" },
  { email: "teacher8@sunrise.test", firstName: "Grace", lastName: "Adeyinka", jobTitle: JobTitle.TEACHER, qualification: "B.A Religious Studies", phone: "+2348030000008" },
];

// SPEC_V0.2.md §3: 2 teachers at Hillcrest — enough for cross-tenant tests.
const HILLCREST_TEACHERS: StaffSeed[] = [
  { email: "teacher@hillcrest.test", firstName: "Peter", lastName: "Etim", jobTitle: JobTitle.TEACHER, qualification: "B.Sc Ed. Mathematics", phone: "+2348040000001" },
  { email: "teacher2@hillcrest.test", firstName: "Comfort", lastName: "Bassey", jobTitle: JobTitle.TEACHER, qualification: "B.A English Language", phone: "+2348040000002" },
];

interface SubjectSeed {
  name: string;
  code: string;
  levels: "ALL" | string[];
}

// SPEC_V0.2.md §3: the full subject list with "sensible level mappings" —
// Physics/Chemistry/Biology/Economics/Government/Literature are SSS-only;
// Basic Science/Social Studies/Business Studies are JSS-only (SSS splits
// Basic Science into the three sciences, and Business Studies into
// Economics/Government); everything else spans all six levels.
const SUNRISE_SUBJECTS: SubjectSeed[] = [
  { name: "Mathematics", code: "MTH", levels: "ALL" },
  { name: "English Language", code: "ENG", levels: "ALL" },
  { name: "Basic Science", code: "BSC", levels: JSS_LEVEL_NAMES },
  { name: "Civic Education", code: "CIV", levels: "ALL" },
  { name: "Social Studies", code: "SOS", levels: JSS_LEVEL_NAMES },
  { name: "Agricultural Science", code: "AGR", levels: "ALL" },
  { name: "Business Studies", code: "BUS", levels: JSS_LEVEL_NAMES },
  { name: "CRS", code: "CRS", levels: "ALL" },
  { name: "IRS", code: "IRS", levels: "ALL" },
  { name: "Physics", code: "PHY", levels: SSS_LEVEL_NAMES },
  { name: "Chemistry", code: "CHM", levels: SSS_LEVEL_NAMES },
  { name: "Biology", code: "BIO", levels: SSS_LEVEL_NAMES },
  { name: "Economics", code: "ECO", levels: SSS_LEVEL_NAMES },
  { name: "Government", code: "GOV", levels: SSS_LEVEL_NAMES },
  { name: "Literature", code: "LIT", levels: SSS_LEVEL_NAMES },
];

// SPEC_V0.2.md §3: 4 subjects at Hillcrest.
const HILLCREST_SUBJECTS: SubjectSeed[] = [
  { name: "Mathematics", code: "MTH", levels: "ALL" },
  { name: "English Language", code: "ENG", levels: "ALL" },
  { name: "Basic Science", code: "BSC", levels: JSS_LEVEL_NAMES },
  { name: "CRS", code: "CRS", levels: "ALL" },
];

function staffNumber(prefix: string, sequence: number): string {
  return `${prefix}/STF/${String(sequence).padStart(4, "0")}`;
}

async function seedStaffProfile(
  schoolId: string,
  userId: string,
  sequence: number,
  prefix: string,
  jobTitle: JobTitle,
  phone: string,
  qualification: string,
) {
  await prisma.staffProfile.upsert({
    where: { userId },
    update: {},
    create: { schoolId, userId, staffNumber: staffNumber(prefix, sequence), jobTitle, phone, qualification },
  });
}

async function seedStaffUser(schoolId: string, prefix: string, sequence: number, seed: StaffSeed, role: UserRole) {
  const user = await prisma.user.upsert({
    where: { schoolId_email: { schoolId, email: seed.email } },
    update: {},
    create: {
      schoolId,
      email: seed.email,
      passwordHash: await hash(SEED_PASSWORD),
      firstName: seed.firstName,
      lastName: seed.lastName,
      role,
    },
  });
  await seedStaffProfile(schoolId, user.id, sequence, prefix, seed.jobTitle, seed.phone, seed.qualification);
  return user;
}

/** Creates every subject and its subject_class_levels mappings; returns subject name -> id. */
async function seedSubjects(
  schoolId: string,
  classLevelIdsByName: Record<string, string>,
  defs: SubjectSeed[],
): Promise<Record<string, string>> {
  const subjectIds: Record<string, string> = {};
  for (const def of defs) {
    const subject = await prisma.subject.upsert({
      where: { schoolId_name: { schoolId, name: def.name } },
      update: {},
      create: { schoolId, name: def.name, code: def.code },
    });
    subjectIds[def.name] = subject.id;

    const levelNames = def.levels === "ALL" ? Object.keys(classLevelIdsByName) : def.levels;
    for (const levelName of levelNames) {
      const classLevelId = classLevelIdsByName[levelName];
      if (!classLevelId) continue;
      await prisma.subjectClassLevel.upsert({
        where: { subjectId_classLevelId: { subjectId: subject.id, classLevelId } },
        update: {},
        create: { schoolId, subjectId: subject.id, classLevelId },
      });
    }
  }
  return subjectIds;
}

/** One class teacher per arm per session — cycles through the given teachers if there are more arms than teachers. */
async function seedClassTeacherAssignments(
  schoolId: string,
  sessionId: string,
  classArmIds: string[],
  teacherUserIds: string[],
) {
  for (let i = 0; i < classArmIds.length; i++) {
    const classArmId = classArmIds[i];
    const teacherUserId = teacherUserIds[i % teacherUserIds.length];
    await prisma.classTeacherAssignment.upsert({
      where: { classArmId_sessionId: { classArmId, sessionId } },
      update: {},
      create: { schoolId, classArmId, sessionId, teacherUserId },
    });
  }
}

async function seedSubjectTeacherAssignments(
  schoolId: string,
  sessionId: string,
  assignments: { subjectId: string; classArmId: string; teacherUserId: string }[],
) {
  for (const assignment of assignments) {
    await prisma.subjectTeacherAssignment.upsert({
      where: {
        subjectId_classArmId_sessionId: {
          subjectId: assignment.subjectId,
          classArmId: assignment.classArmId,
          sessionId,
        },
      },
      update: {},
      create: { schoolId, sessionId, ...assignment },
    });
  }
}

// SPEC_V0.3.md §3 / SPEC_V0.4.md §3: assessment components CA 1 (20, out of
// 20, no approval), CA 2 (20, out of 20, no approval), Exam (60, out of 100,
// approval-required) — weights summing to 100 — and the WAEC 9-point grade
// boundaries, for both schools. Upserted on each school's natural unique
// keys (schoolId+name, schoolId+grade), so idempotent across reseeds; the
// update branch is non-empty (unlike most other seed upserts here) so a
// pre-v0.4 dev database gets max_score/requires_approval backfilled too.
const ASSESSMENT_COMPONENTS: { name: string; weight: number; maxScore: number; requiresApproval: boolean; sortOrder: number }[] = [
  { name: "CA 1", weight: 20, maxScore: 20, requiresApproval: false, sortOrder: 1 },
  { name: "CA 2", weight: 20, maxScore: 20, requiresApproval: false, sortOrder: 2 },
  { name: "Exam", weight: 60, maxScore: 100, requiresApproval: true, sortOrder: 3 },
];

const WAEC_GRADE_BOUNDARIES: { grade: string; minScore: number; maxScore: number; remark: string; sortOrder: number }[] = [
  { grade: "A1", minScore: 75, maxScore: 100, remark: "Excellent", sortOrder: 1 },
  { grade: "B2", minScore: 70, maxScore: 74, remark: "Very Good", sortOrder: 2 },
  { grade: "B3", minScore: 65, maxScore: 69, remark: "Good", sortOrder: 3 },
  { grade: "C4", minScore: 60, maxScore: 64, remark: "Credit", sortOrder: 4 },
  { grade: "C5", minScore: 55, maxScore: 59, remark: "Credit", sortOrder: 5 },
  { grade: "C6", minScore: 50, maxScore: 54, remark: "Credit", sortOrder: 6 },
  { grade: "D7", minScore: 45, maxScore: 49, remark: "Pass", sortOrder: 7 },
  { grade: "E8", minScore: 40, maxScore: 44, remark: "Pass", sortOrder: 8 },
  { grade: "F9", minScore: 0, maxScore: 39, remark: "Fail", sortOrder: 9 },
];

async function seedAssessmentStructure(schoolId: string) {
  // Not an upsert on schoolId_name: that compound unique no longer exists
  // in the Prisma client — it's now a hand-written partial index (WHERE
  // deleted_at IS NULL) that Prisma's DSL/client can't target directly.
  for (const component of ASSESSMENT_COMPONENTS) {
    const existing = await prisma.assessmentComponent.findFirst({
      where: { schoolId, name: component.name, deletedAt: null },
    });
    if (existing) {
      await prisma.assessmentComponent.update({
        where: { id: existing.id },
        data: {
          weight: component.weight,
          maxScore: component.maxScore,
          requiresApproval: component.requiresApproval,
          sortOrder: component.sortOrder,
        },
      });
    } else {
      await prisma.assessmentComponent.create({ data: { schoolId, ...component } });
    }
  }
  for (const boundary of WAEC_GRADE_BOUNDARIES) {
    await prisma.gradeBoundary.upsert({
      where: { schoolId_grade: { schoolId, grade: boundary.grade } },
      update: {},
      create: { schoolId, ...boundary },
    });
  }
  // Converge to exactly the WAEC set: a per-grade upsert alone never
  // removes a boundary outside it (e.g. a "Simple A-F" preset applied via
  // PUT /grade-boundaries during manual/UI testing), which leaves two grade
  // scales coexisting with overlapping ranges — an ambiguous grade-band
  // lookup for any score both cover. Same self-healing idea as
  // assessment_components' soft-delete-on-replace, applied here as a plain
  // delete since grade_boundaries carries no historical references to
  // preserve.
  await prisma.gradeBoundary.deleteMany({
    where: { schoolId, grade: { notIn: WAEC_GRADE_BOUNDARIES.map((b) => b.grade) } },
  });
}

// SPEC_V0.2.md §3: give one seeded student a second guardian (mother) to
// exercise the multi-guardian path. Guardians/student_guardians have no
// natural unique key to upsert against (see docs/DECISIONS.md), so
// idempotency is checked explicitly: skip if this student already has 2+
// guardian links from a prior seed run.
async function seedSecondGuardian(schoolId: string, admissionNumber: string) {
  const student = await prisma.student.findFirst({ where: { schoolId, admissionNumber } });
  if (!student) return;

  const existingLinks = await prisma.studentGuardian.count({ where: { studentId: student.id } });
  if (existingLinks >= 2) return;

  const mother = await prisma.guardian.create({
    data: {
      schoolId,
      firstName: "Funmilayo",
      lastName: "Adeyemi",
      phone: "+2348090000001",
      email: "funmilayo.adeyemi@example.com",
    },
  });
  await prisma.studentGuardian.create({
    data: {
      schoolId,
      studentId: student.id,
      guardianId: mother.id,
      relationship: GuardianRelationship.MOTHER,
      isPrimary: false,
    },
  });
}

async function seedSchoolAcademics(schoolId: string) {
  const session = await prisma.academicSession.upsert({
    where: { schoolId_name: { schoolId, name: CURRENT_SESSION_NAME } },
    update: {},
    create: {
      schoolId,
      name: CURRENT_SESSION_NAME,
      startsOn: new Date("2026-09-01"),
      endsOn: new Date("2027-07-31"),
      isCurrent: true,
    },
  });

  const terms = [
    { name: TermName.FIRST, startsOn: new Date("2026-09-01"), endsOn: new Date("2026-12-12"), isCurrent: true },
    { name: TermName.SECOND, startsOn: new Date("2027-01-05"), endsOn: new Date("2027-04-02"), isCurrent: false },
    { name: TermName.THIRD, startsOn: new Date("2027-04-20"), endsOn: new Date("2027-07-31"), isCurrent: false },
  ];
  const termIds: Record<string, string> = {};
  for (const term of terms) {
    const created = await prisma.term.upsert({
      where: { sessionId_name: { sessionId: session.id, name: term.name } },
      update: {},
      create: { schoolId, sessionId: session.id, ...term },
    });
    termIds[term.name] = created.id;
  }

  const arms: Record<string, string> = {};
  const classLevels: Record<string, string> = {};
  for (const level of CLASS_LEVELS) {
    const classLevel = await prisma.classLevel.upsert({
      where: { schoolId_name: { schoolId, name: level.name } },
      update: {},
      create: { schoolId, name: level.name, rank: level.rank },
    });
    classLevels[level.name] = classLevel.id;
    for (const armName of ARMS) {
      const arm = await prisma.classArm.upsert({
        where: { classLevelId_name: { classLevelId: classLevel.id, name: armName } },
        update: {},
        create: { schoolId, classLevelId: classLevel.id, name: armName },
      });
      arms[`${level.name}-${armName}`] = arm.id;
    }
  }

  return { sessionId: session.id, arms, classLevels, termIds };
}

// A from-scratch bootstrap (empty DB -> migrate -> seed) runs the v0.2
// guardian backfill migration against zero rows, since these students don't
// exist yet at migration time — so every seeded student needs its own
// primary guardian created here too, not just students that predate the
// migration. Idempotent (checked by isPrimary existing) since seed.ts is
// designed to be safely re-run.
async function seedPrimaryGuardian(
  schoolId: string,
  studentId: string,
  guardian: { firstName: string; lastName: string; phone: string; email: string },
) {
  const existingPrimary = await prisma.studentGuardian.findFirst({ where: { studentId, isPrimary: true } });
  if (existingPrimary) return;

  const created = await prisma.guardian.create({ data: { schoolId, ...guardian } });
  await prisma.studentGuardian.create({
    data: {
      schoolId,
      studentId,
      guardianId: created.id,
      relationship: GuardianRelationship.OTHER,
      isPrimary: true,
    },
  });
}

async function seedStudents(
  schoolId: string,
  admissionPrefix: string,
  sessionId: string,
  arms: Record<string, string>,
  students: StudentSeed[],
) {
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const admissionNumber = `${admissionPrefix}/2026/${String(i + 1).padStart(4, "0")}`;
    const armKey = ARM_KEYS[i % ARM_KEYS.length];
    const classArmId = arms[armKey];
    const levelIndex = Math.floor((i % ARM_KEYS.length) / ARMS.length);
    const age = 11 + levelIndex;
    const dateOfBirth = new Date(Date.UTC(2026 - age, i % 12, 5 + (i % 20)));
    const guardianPhone = `+23480${String(10000000 + i).slice(-8)}`;
    const guardianEmail = `guardian.${student.firstName.toLowerCase()}.${student.lastName.toLowerCase()}@example.com`;

    const created = await prisma.student.upsert({
      where: { schoolId_admissionNumber: { schoolId, admissionNumber } },
      update: {},
      create: {
        schoolId,
        admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        gender: student.gender,
        dateOfBirth,
        guardianName: `${student.lastName} Household`,
        guardianPhone,
        guardianEmail,
      },
    });

    await prisma.studentEnrollment.upsert({
      where: { studentId_sessionId: { studentId: created.id, sessionId } },
      update: {},
      create: { schoolId, studentId: created.id, classArmId, sessionId },
    });

    await seedPrimaryGuardian(schoolId, created.id, {
      firstName: student.lastName,
      lastName: "Household",
      phone: guardianPhone,
      email: guardianEmail,
    });
  }
}

async function seedBulkClassArm(
  schoolId: string,
  admissionPrefix: string,
  sessionId: string,
  classArmId: string,
  students: StudentSeed[],
  startingSequence: number,
) {
  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const sequence = startingSequence + i;
    const admissionNumber = `${admissionPrefix}/2026/${String(sequence).padStart(4, "0")}`;
    const age = 12 + (i % 2);
    const dateOfBirth = new Date(Date.UTC(2026 - age, i % 12, 5 + (i % 20)));
    const guardianPhone = `+23481${String(20000000 + sequence).slice(-8)}`;
    const guardianEmail = `guardian.${student.firstName.toLowerCase()}.${student.lastName.toLowerCase()}.${sequence}@example.com`;

    const created = await prisma.student.upsert({
      where: { schoolId_admissionNumber: { schoolId, admissionNumber } },
      update: {},
      create: {
        schoolId,
        admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        gender: student.gender,
        dateOfBirth,
        guardianName: `${student.lastName} Household`,
        guardianPhone,
        guardianEmail,
      },
    });

    await prisma.studentEnrollment.upsert({
      where: { studentId_sessionId: { studentId: created.id, sessionId } },
      update: {},
      create: { schoolId, studentId: created.id, classArmId, sessionId },
    });

    await seedPrimaryGuardian(schoolId, created.id, {
      firstName: student.lastName,
      lastName: "Household",
      phone: guardianPhone,
      email: guardianEmail,
    });
  }
}

// Deterministic pseudo-random in [0,1) from an integer seed (sin-hash trick)
// — NOT Math.random(). Scores must be stable across reseeds so the "prove
// it" numbers in docs/DECISIONS.md and manual verification stay correct.
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 43758.5453123;
  return x - Math.floor(x);
}

// Gives each student a consistent per-subject "ability" (45%-90% of max,
// stable across all three components) plus small per-component noise
// (+/-10%), so scores/ranks/positions form a realistic, reproducible
// distribution instead of flat or fully random numbers.
function deterministicScore(studentIndex: number, componentIndex: number, subjectIndex: number, maxScore: number): number {
  const abilitySeed = studentIndex * 3 + subjectIndex * 97 + 11;
  const noiseSeed = studentIndex * 7 + componentIndex * 13 + subjectIndex * 31 + 1;
  const ability = 0.45 + pseudoRandom(abilitySeed) * 0.45;
  const noise = (pseudoRandom(noiseSeed) - 0.5) * 0.2;
  const percent = Math.min(1, Math.max(0.15, ability + noise));
  return Math.round(percent * maxScore);
}

// Seeds CA1/CA2/Exam raw scores for every enrolled student in a class arm
// for one subject, then computes and stores each student's
// term_subject_result. `publish` simulates the director/owner publish
// action (SPEC_V0.4.md §2 POST /grades/publish) — there's no HTTP surface
// yet, so the seed writes the resulting state directly.
async function seedSubjectGrades(params: {
  schoolId: string;
  sessionId: string;
  termId: string;
  classArmId: string;
  subjectId: string;
  subjectIndex: number;
  components: ComponentInput[];
  boundaries: GradeBoundaryInput[];
  enteredByUserId: string;
  publish: boolean;
}): Promise<string[]> {
  const { schoolId, sessionId, termId, classArmId, subjectId, subjectIndex, components, boundaries, enteredByUserId, publish } = params;

  const enrollments = await prisma.studentEnrollment.findMany({
    where: { schoolId, classArmId, sessionId },
    orderBy: { studentId: "asc" },
  });
  const studentIds = enrollments.map((e) => e.studentId);

  for (let i = 0; i < studentIds.length; i++) {
    const studentId = studentIds[i];
    for (let c = 0; c < components.length; c++) {
      const component = components[c];
      const rawScore = deterministicScore(i, c, subjectIndex, component.maxScore);
      await prisma.studentScore.upsert({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId,
            subjectId,
            componentId: component.id,
            termId,
            sessionId,
          },
        },
        update: { rawScore, enteredBy: enteredByUserId, enteredAt: new Date() },
        create: {
          schoolId,
          studentId,
          subjectId,
          componentId: component.id,
          sessionId,
          termId,
          classArmId,
          rawScore,
          enteredBy: enteredByUserId,
          enteredAt: new Date(),
        },
      });
    }
  }

  const totals = new Map<string, number>();
  const draftOrPending = new Map<string, "DRAFT" | "PENDING_APPROVAL">();
  for (const studentId of studentIds) {
    const scores = await prisma.studentScore.findMany({ where: { studentId, subjectId, termId, sessionId } });
    const scoreInputs = scores.map((s) => ({
      componentId: s.componentId,
      rawScore: s.rawScore === null ? null : Number(s.rawScore),
    }));
    totals.set(studentId, computeSubjectTotal(components, scoreInputs));
    draftOrPending.set(studentId, computeSubjectStatus(components, scoreInputs));
  }

  let positions: Map<string, number> | null = null;
  if (publish) {
    const ranking = computeStandardCompetitionRanking(studentIds, (id) => totals.get(id)!);
    positions = new Map(ranking.map((r) => [r.item, r.position]));
  }

  for (const studentId of studentIds) {
    const total = totals.get(studentId)!;
    const autoGrade = resolveGradeBand(total, boundaries);
    const status: ResultStatus = publish ? "PUBLISHED" : draftOrPending.get(studentId)!;
    const data = {
      schoolId,
      classArmId,
      totalScore: total,
      autoGrade,
      finalGrade: autoGrade,
      subjectPosition: positions?.get(studentId) ?? null,
      status,
      publishedAt: publish ? new Date() : null,
    };
    await prisma.termSubjectResult.upsert({
      where: { studentId_subjectId_termId_sessionId: { studentId, subjectId, termId, sessionId } },
      update: data,
      create: { ...data, studentId, subjectId, sessionId, termId },
    });
  }

  return studentIds;
}

// Computes and stores each student's term_overall_result from whatever
// term_subject_results already exist for them this term — status and
// overall positions derive automatically from the subject statuses
// (SPEC_V0.4.md §1: "publishes when all its subject results are
// published"), no separate publish flag needed here.
async function seedOverallResults(params: {
  schoolId: string;
  sessionId: string;
  termId: string;
  classArmId: string;
  studentIds: string[];
  boundaries: GradeBoundaryInput[];
}) {
  const { schoolId, sessionId, termId, classArmId, studentIds, boundaries } = params;
  if (studentIds.length === 0) return;

  const allResults = await prisma.termSubjectResult.findMany({
    where: { studentId: { in: studentIds }, termId, sessionId },
  });
  const byStudent = new Map<string, typeof allResults>();
  for (const result of allResults) {
    const arr = byStudent.get(result.studentId) ?? [];
    arr.push(result);
    byStudent.set(result.studentId, arr);
  }

  const averages = new Map<string, number>();
  const statuses = new Map<string, "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED">();
  for (const studentId of studentIds) {
    const results = byStudent.get(studentId) ?? [];
    averages.set(studentId, computeOverallAverage(results.map((r) => Number(r.totalScore))));
    statuses.set(studentId, computeOverallStatus(results.map((r) => r.status)));
  }

  const allPublished = studentIds.every((id) => statuses.get(id) === "PUBLISHED");
  let positions: Map<string, number> | null = null;
  if (allPublished) {
    const ranking = computeStandardCompetitionRanking(studentIds, (id) => averages.get(id)!);
    positions = new Map(ranking.map((r) => [r.item, r.position]));
  }

  for (const studentId of studentIds) {
    const results = byStudent.get(studentId) ?? [];
    const avg = averages.get(studentId)!;
    const avgGrade = resolveGradeBand(avg, boundaries);
    const data = {
      schoolId,
      classArmId,
      averageScore: avg,
      averageGrade: avgGrade,
      subjectsCount: results.length,
      overallPosition: positions?.get(studentId) ?? null,
      status: statuses.get(studentId)!,
    };
    await prisma.termOverallResult.upsert({
      where: { studentId_termId_sessionId: { studentId, termId, sessionId } },
      update: data,
      create: { ...data, studentId, sessionId, termId },
    });
  }
}

async function main() {
  const platform = await prisma.school.upsert({
    where: { slug: "platform" },
    update: {},
    create: {
      name: "ScholaMetric Platform",
      slug: "platform",
      type: SchoolType.COMBINED,
      status: "ACTIVE",
    },
  });
  await prisma.user.upsert({
    where: { schoolId_email: { schoolId: platform.id, email: "super@scholametric.test" } },
    update: {},
    create: {
      schoolId: platform.id,
      email: "super@scholametric.test",
      passwordHash: await hash(SEED_PASSWORD),
      firstName: "Super",
      lastName: "Admin",
      role: UserRole.SUPER_ADMIN,
    },
  });

  const sunrise = await prisma.school.upsert({
    where: { slug: "sunrise" },
    update: {},
    create: {
      name: "Sunrise College",
      slug: "sunrise",
      type: SchoolType.SECONDARY,
      status: "ACTIVE",
    },
  });
  const sunriseAdmin = await prisma.user.upsert({
    where: { schoolId_email: { schoolId: sunrise.id, email: "admin@sunrise.test" } },
    update: {},
    create: {
      schoolId: sunrise.id,
      email: "admin@sunrise.test",
      passwordHash: await hash(SEED_PASSWORD),
      firstName: "Adaobi",
      lastName: "Nwachukwu",
      role: UserRole.SCHOOL_ADMIN,
    },
  });
  const sunriseAcademics = await seedSchoolAcademics(sunrise.id);
  await seedStudents(sunrise.id, "SUN", sunriseAcademics.sessionId, sunriseAcademics.arms, SUNRISE_STUDENTS);
  await seedBulkClassArm(
    sunrise.id,
    "SUN",
    sunriseAcademics.sessionId,
    sunriseAcademics.arms["JSS 2-A"],
    generateBulkClassStudents(BULK_CLASS_SIZE),
    BULK_CLASS_STARTING_SEQUENCE,
  );

  // SPEC_V0.2.md §3 — proprietor, Adaobi's PRINCIPAL profile (she stays
  // SCHOOL_ADMIN — title is organizational, not a permission level), 8
  // teachers, subjects + level mappings, a class teacher on every arm,
  // subject teachers covering JSS 1-2, and a second guardian.
  const sunriseProprietor = await prisma.user.upsert({
    where: { schoolId_email: { schoolId: sunrise.id, email: "proprietor@sunrise.test" } },
    update: {},
    create: {
      schoolId: sunrise.id,
      email: "proprietor@sunrise.test",
      passwordHash: await hash(SEED_PASSWORD),
      firstName: "Olumide",
      lastName: "Adebanjo",
      role: UserRole.PROPRIETOR,
    },
  });
  await seedStaffProfile(
    sunrise.id,
    sunriseProprietor.id,
    1,
    "SUN",
    JobTitle.DIRECTOR_PROPRIETOR,
    "+2348020000001",
    "B.Sc Business Administration",
  );
  await seedStaffProfile(
    sunrise.id,
    sunriseAdmin.id,
    2,
    "SUN",
    JobTitle.PRINCIPAL,
    "+2348020000002",
    "M.Ed Educational Administration",
  );

  const sunriseTeacherUserIds: string[] = [];
  for (let i = 0; i < SUNRISE_TEACHERS.length; i++) {
    const teacherUser = await seedStaffUser(sunrise.id, "SUN", 3 + i, SUNRISE_TEACHERS[i], UserRole.TEACHER);
    sunriseTeacherUserIds.push(teacherUser.id);
  }

  const sunriseSubjectIds = await seedSubjects(sunrise.id, sunriseAcademics.classLevels, SUNRISE_SUBJECTS);

  await seedClassTeacherAssignments(
    sunrise.id,
    sunriseAcademics.sessionId,
    ARM_KEYS.map((key) => sunriseAcademics.arms[key]),
    sunriseTeacherUserIds,
  );

  const jss1And2ArmKeys = ["JSS 1-A", "JSS 1-B", "JSS 2-A", "JSS 2-B"];
  await seedSubjectTeacherAssignments(
    sunrise.id,
    sunriseAcademics.sessionId,
    jss1And2ArmKeys.flatMap((armKey) => [
      { subjectId: sunriseSubjectIds["Mathematics"], classArmId: sunriseAcademics.arms[armKey], teacherUserId: sunriseTeacherUserIds[0] },
      { subjectId: sunriseSubjectIds["English Language"], classArmId: sunriseAcademics.arms[armKey], teacherUserId: sunriseTeacherUserIds[1] },
    ]),
  );

  await seedSecondGuardian(sunrise.id, "SUN/2026/0001");
  await seedAssessmentStructure(sunrise.id);

  const sunriseComponents = await prisma.assessmentComponent.findMany({
    where: { schoolId: sunrise.id, deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  const sunriseBoundaries = await prisma.gradeBoundary.findMany({
    where: { schoolId: sunrise.id },
    orderBy: { sortOrder: "asc" },
  });
  const sunriseFirstTermId = sunriseAcademics.termIds[TermName.FIRST];

  // SPEC_V0.4.md §3: realistic First Term scores for Mathematics + English
  // across JSS 1 A and the ~100-student JSS 2 A. JSS 1 A Mathematics is left
  // PENDING_APPROVAL (exam scored, not yet published) and English PUBLISHED
  // — both states demoable from seed, per spec. JSS 2 A publishes both, so
  // its overall results and positions are also exercised end to end.
  for (const armKey of ["JSS 1-A", "JSS 2-A"]) {
    const classArmId = sunriseAcademics.arms[armKey];
    const publishMath = armKey !== "JSS 1-A";

    const mathStudentIds = await seedSubjectGrades({
      schoolId: sunrise.id,
      sessionId: sunriseAcademics.sessionId,
      termId: sunriseFirstTermId,
      classArmId,
      subjectId: sunriseSubjectIds["Mathematics"],
      subjectIndex: 0,
      components: sunriseComponents,
      boundaries: sunriseBoundaries,
      enteredByUserId: sunriseTeacherUserIds[0],
      publish: publishMath,
    });
    await seedSubjectGrades({
      schoolId: sunrise.id,
      sessionId: sunriseAcademics.sessionId,
      termId: sunriseFirstTermId,
      classArmId,
      subjectId: sunriseSubjectIds["English Language"],
      subjectIndex: 1,
      components: sunriseComponents,
      boundaries: sunriseBoundaries,
      enteredByUserId: sunriseTeacherUserIds[1],
      publish: true,
    });

    await seedOverallResults({
      schoolId: sunrise.id,
      sessionId: sunriseAcademics.sessionId,
      termId: sunriseFirstTermId,
      classArmId,
      studentIds: mathStudentIds,
      boundaries: sunriseBoundaries,
    });
  }

  // SPEC_V0.3.md §3: a teacher forced through change-password on first
  // login — seeded separately from SUNRISE_TEACHERS (not added to that
  // array) so it never enters the class-teacher/subject-teacher
  // assignment cycling above; it exists purely to exercise the
  // must_change_password flow, no assignments needed. Staff number 99
  // (not the next sequential slot) deliberately, to never collide with
  // real staff numbers or with prior manual-testing residue in a
  // long-lived dev database (staff_profiles has a real UNIQUE(school_id,
  // staff_number) constraint — confirmed the hard way).
  const sunriseNewTeacher = await seedStaffUser(
    sunrise.id,
    "SUN",
    99,
    {
      email: "newteacher@sunrise.test",
      firstName: "New",
      lastName: "Teacher",
      jobTitle: JobTitle.TEACHER,
      qualification: "B.Ed",
      phone: "+2348030000099",
    },
    UserRole.TEACHER,
  );
  await prisma.user.update({ where: { id: sunriseNewTeacher.id }, data: { mustChangePassword: true } });

  const hillcrest = await prisma.school.upsert({
    where: { slug: "hillcrest" },
    update: {},
    create: {
      name: "Hillcrest Academy",
      slug: "hillcrest",
      type: SchoolType.SECONDARY,
      status: "ACTIVE",
    },
  });
  const hillcrestAdmin = await prisma.user.upsert({
    where: { schoolId_email: { schoolId: hillcrest.id, email: "admin@hillcrest.test" } },
    update: {},
    create: {
      schoolId: hillcrest.id,
      email: "admin@hillcrest.test",
      passwordHash: await hash(SEED_PASSWORD),
      firstName: "Grace",
      lastName: "Effiong",
      role: UserRole.SCHOOL_ADMIN,
    },
  });
  const hillcrestAcademics = await seedSchoolAcademics(hillcrest.id);
  await seedStudents(hillcrest.id, "HIL", hillcrestAcademics.sessionId, hillcrestAcademics.arms, HILLCREST_STUDENTS);

  await seedStaffProfile(
    hillcrest.id,
    hillcrestAdmin.id,
    1,
    "HIL",
    JobTitle.PRINCIPAL,
    "+2348050000001",
    "M.Ed Educational Administration",
  );

  const hillcrestTeacherUserIds: string[] = [];
  for (let i = 0; i < HILLCREST_TEACHERS.length; i++) {
    const teacherUser = await seedStaffUser(hillcrest.id, "HIL", 2 + i, HILLCREST_TEACHERS[i], UserRole.TEACHER);
    hillcrestTeacherUserIds.push(teacherUser.id);
  }

  const hillcrestSubjectIds = await seedSubjects(hillcrest.id, hillcrestAcademics.classLevels, HILLCREST_SUBJECTS);

  // One class-teacher assignment — enough for cross-tenant tests.
  await seedClassTeacherAssignments(
    hillcrest.id,
    hillcrestAcademics.sessionId,
    [hillcrestAcademics.arms["JSS 1-A"]],
    [hillcrestTeacherUserIds[0]],
  );

  await seedAssessmentStructure(hillcrest.id);

  // SPEC_V0.4.md §3: a smaller slice — one subject, one class — so
  // cross-tenant grade tests have real data to assert 404 against.
  const hillcrestComponents = await prisma.assessmentComponent.findMany({
    where: { schoolId: hillcrest.id, deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
  const hillcrestBoundaries = await prisma.gradeBoundary.findMany({
    where: { schoolId: hillcrest.id },
    orderBy: { sortOrder: "asc" },
  });
  const hillcrestFirstTermId = hillcrestAcademics.termIds[TermName.FIRST];
  const hillcrestJss1AArmId = hillcrestAcademics.arms["JSS 1-A"];

  const hillcrestMathStudentIds = await seedSubjectGrades({
    schoolId: hillcrest.id,
    sessionId: hillcrestAcademics.sessionId,
    termId: hillcrestFirstTermId,
    classArmId: hillcrestJss1AArmId,
    subjectId: hillcrestSubjectIds["Mathematics"],
    subjectIndex: 0,
    components: hillcrestComponents,
    boundaries: hillcrestBoundaries,
    enteredByUserId: hillcrestTeacherUserIds[0],
    publish: true,
  });
  await seedOverallResults({
    schoolId: hillcrest.id,
    sessionId: hillcrestAcademics.sessionId,
    termId: hillcrestFirstTermId,
    classArmId: hillcrestJss1AArmId,
    studentIds: hillcrestMathStudentIds,
    boundaries: hillcrestBoundaries,
  });

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
