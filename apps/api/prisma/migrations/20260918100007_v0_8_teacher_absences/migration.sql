-- CreateEnum
CREATE TYPE "TimetableExceptionType" AS ENUM ('CANCELLED_TEACHER_ABSENT', 'REPLACED');

-- NOTE: prisma migrate dev regenerates a DROP INDEX for
-- students_first_name_trgm_idx / students_last_name_trgm_idx on every run
-- in this repo — those two indexes were added by hand (gin_trgm_ops isn't
-- expressible in Prisma's schema DSL, see docs/DECISIONS.md) so Prisma's
-- diff always sees them as drift and proposes dropping them. Stripped here;
-- they are untouched by this migration.

-- CreateTable
CREATE TABLE "teacher_absences" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "period_ids" UUID[],
    "note" TEXT NOT NULL,
    "auto_approved" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_exceptions" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "period_id" UUID NOT NULL,
    "type" "TimetableExceptionType" NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "note" TEXT,
    "replacement_teacher_user_id" UUID,
    "replacement_subject_id" UUID,
    "activity_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_absences_school_id_teacher_user_id_date_idx" ON "teacher_absences"("school_id", "teacher_user_id", "date");

-- CreateIndex
CREATE INDEX "timetable_exceptions_school_id_date_idx" ON "timetable_exceptions"("school_id", "date");

-- CreateIndex
CREATE INDEX "timetable_exceptions_teacher_user_id_date_idx" ON "timetable_exceptions"("teacher_user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_exceptions_class_arm_id_date_period_id_key" ON "timetable_exceptions"("class_arm_id", "date", "period_id");

-- AddForeignKey
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_exceptions" ADD CONSTRAINT "timetable_exceptions_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_exceptions" ADD CONSTRAINT "timetable_exceptions_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_exceptions" ADD CONSTRAINT "timetable_exceptions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_exceptions" ADD CONSTRAINT "timetable_exceptions_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_exceptions" ADD CONSTRAINT "timetable_exceptions_replacement_teacher_user_id_fkey" FOREIGN KEY ("replacement_teacher_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_exceptions" ADD CONSTRAINT "timetable_exceptions_replacement_subject_id_fkey" FOREIGN KEY ("replacement_subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
