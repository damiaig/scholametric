import { PrismaClient, SchoolType, UserRole, TermName, Gender } from "@prisma/client";
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
  for (const level of CLASS_LEVELS) {
    const classLevel = await prisma.classLevel.upsert({
      where: { schoolId_name: { schoolId, name: level.name } },
      update: {},
      create: { schoolId, name: level.name, rank: level.rank },
    });
    for (const armName of ARMS) {
      const arm = await prisma.classArm.upsert({
        where: { classLevelId_name: { classLevelId: classLevel.id, name: armName } },
        update: {},
        create: { schoolId, classLevelId: classLevel.id, name: armName },
      });
      arms[`${level.name}-${armName}`] = arm.id;
    }
  }

  return { sessionId: session.id, arms };
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
  await prisma.user.upsert({
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
  await prisma.user.upsert({
    where: { schoolId_email: { schoolId: sunrise.id, email: "teacher@sunrise.test" } },
    update: {},
    create: {
      schoolId: sunrise.id,
      email: "teacher@sunrise.test",
      passwordHash: await hash(SEED_PASSWORD),
      firstName: "Bola",
      lastName: "Ogundare",
      role: UserRole.TEACHER,
    },
  });
  const sunriseAcademics = await seedSchoolAcademics(sunrise.id);
  await seedStudents(sunrise.id, "SUN", sunriseAcademics.sessionId, sunriseAcademics.arms, SUNRISE_STUDENTS);

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
  await prisma.user.upsert({
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
