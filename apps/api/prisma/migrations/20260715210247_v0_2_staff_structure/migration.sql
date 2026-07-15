-- CreateEnum
CREATE TYPE "JobTitle" AS ENUM ('DIRECTOR_PROPRIETOR', 'PRINCIPAL', 'VICE_PRINCIPAL', 'REGISTRAR', 'EXAMINATION_OFFICER', 'BURSAR', 'SECRETARY', 'ICT_ADMINISTRATOR', 'SCHOOL_NURSE', 'GUIDANCE_COUNSELOR', 'TEACHER', 'OTHER');

-- CreateEnum
CREATE TYPE "GuardianRelationship" AS ENUM ('FATHER', 'MOTHER', 'STEPFATHER', 'STEPMOTHER', 'GRANDPARENT', 'UNCLE', 'AUNT', 'SIBLING', 'LEGAL_GUARDIAN', 'OTHER');

-- AlterEnum
-- Positioned per SPEC_V0.2.md §1's stated hierarchy (SUPER_ADMIN,
-- PROPRIETOR, SCHOOL_ADMIN, ...) rather than left to append at the end.
ALTER TYPE "UserRole" ADD VALUE 'PROPRIETOR' BEFORE 'SCHOOL_ADMIN';

-- The trigram indexes on students(first_name)/students(last_name) are
-- hand-written SQL not modeled in schema.prisma (Prisma has no DSL for
-- gin_trgm_ops) — `prisma migrate dev --create-only` proposed dropping
-- them here because it can't tell they're wanted. Per the standing rule
-- in docs/DECISIONS.md, these two DROP INDEX statements have been
-- deleted from this migration; do not re-add them.

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "staff_number" TEXT NOT NULL,
    "job_title" "JobTitle" NOT NULL,
    "phone" TEXT,
    "qualification" TEXT,
    "date_employed" DATE,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_class_levels" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "class_level_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_class_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_teacher_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_teacher_assignments" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardians" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_guardians" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "relationship" "GuardianRelationship" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_user_id_key" ON "staff_profiles"("user_id");

-- CreateIndex
CREATE INDEX "staff_profiles_school_id_idx" ON "staff_profiles"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_school_id_staff_number_key" ON "staff_profiles"("school_id", "staff_number");

-- CreateIndex
CREATE INDEX "subjects_school_id_idx" ON "subjects"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_school_id_name_key" ON "subjects"("school_id", "name");

-- CreateIndex
CREATE INDEX "subject_class_levels_school_id_idx" ON "subject_class_levels"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_class_levels_subject_id_class_level_id_key" ON "subject_class_levels"("subject_id", "class_level_id");

-- CreateIndex
CREATE INDEX "class_teacher_assignments_school_id_idx" ON "class_teacher_assignments"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_teacher_assignments_class_arm_id_session_id_key" ON "class_teacher_assignments"("class_arm_id", "session_id");

-- CreateIndex
CREATE INDEX "subject_teacher_assignments_school_id_teacher_user_id_sessi_idx" ON "subject_teacher_assignments"("school_id", "teacher_user_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_teacher_assignments_subject_id_class_arm_id_session_key" ON "subject_teacher_assignments"("subject_id", "class_arm_id", "session_id");

-- CreateIndex
CREATE INDEX "guardians_school_id_idx" ON "guardians"("school_id");

-- CreateIndex
CREATE INDEX "student_guardians_school_id_idx" ON "student_guardians"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_guardians_student_id_guardian_id_key" ON "student_guardians"("student_id", "guardian_id");

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_class_levels" ADD CONSTRAINT "subject_class_levels_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_class_levels" ADD CONSTRAINT "subject_class_levels_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_class_levels" ADD CONSTRAINT "subject_class_levels_class_level_id_fkey" FOREIGN KEY ("class_level_id") REFERENCES "class_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_teacher_assignments" ADD CONSTRAINT "subject_teacher_assignments_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_teacher_assignments" ADD CONSTRAINT "subject_teacher_assignments_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_teacher_assignments" ADD CONSTRAINT "subject_teacher_assignments_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_teacher_assignments" ADD CONSTRAINT "subject_teacher_assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_teacher_assignments" ADD CONSTRAINT "subject_teacher_assignments_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_guardians" ADD CONSTRAINT "student_guardians_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: partial unique index not expressible in schema.prisma.
-- Exactly one is_primary = true per student (SPEC_V0.2.md §1), same
-- pattern as v0.1's academic_sessions/terms current-flag indexes.
CREATE UNIQUE INDEX "student_guardians_one_primary_per_student"
    ON "student_guardians" ("student_id")
    WHERE "is_primary" = true;

-- Guardian backfill (SPEC_V0.2.md §1): one guardian + one primary
-- student_guardians link per existing student, split from the frozen
-- guardian_name column on the LAST space (best-effort — "Mary Jane
-- Watson" -> first_name "Mary Jane", last_name "Watson"; a name with no
-- space at all becomes first_name = the whole name, last_name = '').
-- relationship is OTHER since the old schema never recorded a real
-- relationship. New guardian rows use gen_random_uuid() (UUIDv4, built
-- into Postgres 13+ core) rather than the app's client-side UUIDv7
-- helper, which isn't available to raw SQL in a migration — the
-- sanctioned fallback per CLAUDE.md §5.
WITH guardian_seed AS (
    SELECT
        s.id AS student_id,
        s.school_id,
        gen_random_uuid() AS guardian_id,
        s.guardian_phone,
        s.guardian_email,
        trim(s.guardian_name) AS full_name
    FROM "students" s
),
split_names AS (
    SELECT
        student_id,
        school_id,
        guardian_id,
        guardian_phone,
        guardian_email,
        CASE
            WHEN strpos(reverse(full_name), ' ') = 0 THEN full_name
            ELSE left(full_name, length(full_name) - strpos(reverse(full_name), ' '))
        END AS first_name,
        CASE
            WHEN strpos(reverse(full_name), ' ') = 0 THEN ''
            ELSE right(full_name, strpos(reverse(full_name), ' ') - 1)
        END AS last_name
    FROM guardian_seed
),
inserted_guardians AS (
    INSERT INTO "guardians" ("id", "school_id", "first_name", "last_name", "phone", "email", "created_at", "updated_at")
    SELECT guardian_id, school_id, first_name, last_name, guardian_phone, guardian_email, now(), now()
    FROM split_names
    RETURNING "id"
)
INSERT INTO "student_guardians" ("id", "school_id", "student_id", "guardian_id", "relationship", "is_primary", "created_at", "updated_at")
SELECT gen_random_uuid(), school_id, student_id, guardian_id, 'OTHER', true, now(), now()
FROM split_names;
