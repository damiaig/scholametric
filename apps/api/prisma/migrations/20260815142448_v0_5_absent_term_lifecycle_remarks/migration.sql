-- NOTE: prisma migrate dev's diff engine wanted to DROP
-- students_first_name_trgm_idx / students_last_name_trgm_idx here — both
-- are hand-added (initial migration; Prisma's index DSL can't express
-- gin_trgm_ops) and untracked by schema.prisma, so an unrelated schema
-- change makes Prisma see them as "extra" and want them gone. Removed
-- from this migration by hand — never touch these two indexes as a side
-- effect of an unrelated change. See docs/DECISIONS.md.

-- AlterTable
ALTER TABLE "student_scores" ADD COLUMN     "is_absent" BOOLEAN NOT NULL DEFAULT false;

-- A row can be a real score OR absent, never both — this is a data-
-- integrity invariant (an uninterpretable row), not a business rule, so
-- it belongs at the DB layer regardless of which future write path
-- (score-entry API, a later import, a manual fix) produces the row.
-- Step 2's DTO enforces the same rule again at the API layer.
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_raw_score_or_absent_check"
  CHECK (NOT (raw_score IS NOT NULL AND is_absent = true));

-- AlterTable
ALTER TABLE "terms" ADD COLUMN     "closed_at" TIMESTAMP(3),
ADD COLUMN     "closed_by" UUID;

-- CreateTable
CREATE TABLE "term_unlocks" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "unlocked_by" UUID NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relocked_by" UUID,
    "relocked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_remarks" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "teacher_remark" TEXT,
    "teacher_remark_by" UUID,
    "teacher_remark_at" TIMESTAMP(3),
    "principal_remark" TEXT,
    "principal_remark_by" UUID,
    "principal_remark_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_remarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "term_unlocks_school_id_term_id_class_arm_id_subject_id_idx" ON "term_unlocks"("school_id", "term_id", "class_arm_id", "subject_id");

-- At most one ACTIVE (not-yet-relocked) unlock per (term, class arm,
-- subject) at a time — Prisma's schema DSL can't express a partial
-- unique index, same pattern as the is_current partial uniques elsewhere
-- in this schema (hand-added in earlier migrations).
CREATE UNIQUE INDEX "term_unlocks_active_unique" ON "term_unlocks"("term_id", "class_arm_id", "subject_id") WHERE "relocked_at" IS NULL;

-- CreateIndex
CREATE INDEX "term_remarks_school_id_class_arm_id_term_id_idx" ON "term_remarks"("school_id", "class_arm_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "term_remarks_student_id_term_id_session_id_key" ON "term_remarks"("student_id", "term_id", "session_id");

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_unlocks" ADD CONSTRAINT "term_unlocks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_unlocks" ADD CONSTRAINT "term_unlocks_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_unlocks" ADD CONSTRAINT "term_unlocks_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_unlocks" ADD CONSTRAINT "term_unlocks_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_unlocks" ADD CONSTRAINT "term_unlocks_unlocked_by_fkey" FOREIGN KEY ("unlocked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_unlocks" ADD CONSTRAINT "term_unlocks_relocked_by_fkey" FOREIGN KEY ("relocked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_remarks" ADD CONSTRAINT "term_remarks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_remarks" ADD CONSTRAINT "term_remarks_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_remarks" ADD CONSTRAINT "term_remarks_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_remarks" ADD CONSTRAINT "term_remarks_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_remarks" ADD CONSTRAINT "term_remarks_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_remarks" ADD CONSTRAINT "term_remarks_teacher_remark_by_fkey" FOREIGN KEY ("teacher_remark_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_remarks" ADD CONSTRAINT "term_remarks_principal_remark_by_fkey" FOREIGN KEY ("principal_remark_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
