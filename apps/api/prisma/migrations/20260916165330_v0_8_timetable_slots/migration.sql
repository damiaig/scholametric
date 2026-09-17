-- v0.8 step 2 (SPEC_V0.8.md §7 item 2) — the repeating weekly timetable
-- template. Purely additive: one new enum (Weekday, deliberately six
-- members, no SUNDAY), one new table (timetable_slots), no existing
-- table altered.
--
-- NOTE: `prisma migrate diff` also proposed DROP INDEX for
-- students_first_name_trgm_idx / students_last_name_trgm_idx here — same
-- known false positive every prior migration in this repo has hit (hand-
-- added gin_trgm_ops indexes, untracked by schema.prisma's DSL). Removed
-- from this file; do not reintroduce.

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "day_of_week" "Weekday" NOT NULL,
    "period_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "teacher_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_slots_school_id_idx" ON "timetable_slots"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_class_arm_id_day_of_week_period_id_session__key" ON "timetable_slots"("class_arm_id", "day_of_week", "period_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_slots_teacher_user_id_day_of_week_period_id_sessi_key" ON "timetable_slots"("teacher_user_id", "day_of_week", "period_id", "session_id");

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_teacher_user_id_fkey" FOREIGN KEY ("teacher_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
