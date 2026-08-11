-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PUBLISHED');

-- DropIndex
-- Replaced below with a partial unique index (WHERE deleted_at IS NULL) —
-- soft-deleted components must not block reusing their name. Prisma's
-- schema DSL can't express partial indexes, so this is hand-written.
DROP INDEX "assessment_components_school_id_name_key";

-- Note: Prisma proposed DROP INDEX statements for students_first_name_trgm_idx
-- and students_last_name_trgm_idx here because it doesn't recognize the
-- hand-written trigram indexes from the init migration. Removed — see
-- docs/DECISIONS.md and the established pattern from prior migrations.

-- AlterTable
ALTER TABLE "assessment_components" ADD COLUMN     "max_score" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "requires_approval" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex (hand-written partial unique index — soft-deleted rows excluded)
CREATE UNIQUE INDEX "assessment_components_school_id_name_key" ON "assessment_components"("school_id", "name") WHERE "deleted_at" IS NULL;

-- CreateTable
CREATE TABLE "student_scores" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "raw_score" DECIMAL(5,2),
    "entered_by" UUID,
    "entered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_subject_results" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "total_score" DECIMAL(5,2) NOT NULL,
    "auto_grade" TEXT,
    "override_grade" TEXT,
    "final_grade" TEXT,
    "subject_position" INTEGER,
    "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_subject_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_overall_results" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "average_score" DECIMAL(5,2) NOT NULL,
    "average_grade" TEXT,
    "overall_position" INTEGER,
    "subjects_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_overall_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_scores_school_id_class_arm_id_subject_id_term_id_se_idx" ON "student_scores"("school_id", "class_arm_id", "subject_id", "term_id", "session_id");

-- CreateIndex
CREATE INDEX "student_scores_school_id_student_id_term_id_session_id_idx" ON "student_scores"("school_id", "student_id", "term_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_scores_student_id_subject_id_component_id_term_id_s_key" ON "student_scores"("student_id", "subject_id", "component_id", "term_id", "session_id");

-- CreateIndex
CREATE INDEX "term_subject_results_school_id_class_arm_id_subject_id_term_idx" ON "term_subject_results"("school_id", "class_arm_id", "subject_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "term_subject_results_student_id_subject_id_term_id_session__key" ON "term_subject_results"("student_id", "subject_id", "term_id", "session_id");

-- CreateIndex
CREATE INDEX "term_overall_results_school_id_class_arm_id_term_id_idx" ON "term_overall_results"("school_id", "class_arm_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "term_overall_results_student_id_term_id_session_id_key" ON "term_overall_results"("student_id", "term_id", "session_id");

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "assessment_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_scores" ADD CONSTRAINT "student_scores_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_results" ADD CONSTRAINT "term_subject_results_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_results" ADD CONSTRAINT "term_subject_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_results" ADD CONSTRAINT "term_subject_results_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_results" ADD CONSTRAINT "term_subject_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_results" ADD CONSTRAINT "term_subject_results_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_results" ADD CONSTRAINT "term_subject_results_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_overall_results" ADD CONSTRAINT "term_overall_results_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_overall_results" ADD CONSTRAINT "term_overall_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_overall_results" ADD CONSTRAINT "term_overall_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_overall_results" ADD CONSTRAINT "term_overall_results_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_overall_results" ADD CONSTRAINT "term_overall_results_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
