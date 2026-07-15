import { PrismaClient, SchoolType, UserRole, TermName, Gender, JobTitle, GuardianRelationship } from "@prisma/client";
import bcrypt from "bcrypt";

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
  for (const term of terms) {
    await prisma.term.upsert({
      where: { sessionId_name: { sessionId: session.id, name: term.name } },
      update: {},
      create: { schoolId, sessionId: session.id, ...term },
    });
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

  return { sessionId: session.id, arms, classLevels };
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
        guardianPhone: `+23480${String(10000000 + i).slice(-8)}`,
        guardianEmail: `guardian.${student.firstName.toLowerCase()}.${student.lastName.toLowerCase()}@example.com`,
      },
    });

    await prisma.studentEnrollment.upsert({
      where: { studentId_sessionId: { studentId: created.id, sessionId } },
      update: {},
      create: { schoolId, studentId: created.id, classArmId, sessionId },
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
        guardianPhone: `+23481${String(20000000 + sequence).slice(-8)}`,
        guardianEmail: `guardian.${student.firstName.toLowerCase()}.${student.lastName.toLowerCase()}.${sequence}@example.com`,
      },
    });

    await prisma.studentEnrollment.upsert({
      where: { studentId_sessionId: { studentId: created.id, sessionId } },
      update: {},
      create: { schoolId, studentId: created.id, classArmId, sessionId },
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

  await seedSubjects(hillcrest.id, hillcrestAcademics.classLevels, HILLCREST_SUBJECTS);

  // One class-teacher assignment — enough for cross-tenant tests.
  await seedClassTeacherAssignments(
    hillcrest.id,
    hillcrestAcademics.sessionId,
    [hillcrestAcademics.arms["JSS 1-A"]],
    [hillcrestTeacherUserIds[0]],
  );

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
