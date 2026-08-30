-- v0.7 step 1 (SPEC_V0.7.md §2/§5) — schema cutover, no pilot-school data
-- to preserve (see docs/DECISIONS.md): drops the fixed CA1/CA2/Exam
-- assessment-component model entirely and replaces it with teacher-
-- created evaluations (Track A, feeds term_subject_results/
-- term_overall_results unchanged) and a wholly separate exam track
-- (Track B, its own cache tables).
--
-- NOTE: `prisma migrate diff` also proposed DROP INDEX for
-- students_first_name_trgm_idx / students_last_name_trgm_idx here — same
-- known false positive every prior migration in this repo has hit (hand-
-- added gin_trgm_ops indexes, untracked by schema.prisma's DSL). Removed
-- from this file; do not reintroduce.

-- DropForeignKey
ALTER TABLE "assessment_components" DROP CONSTRAINT "assessment_components_school_id_fkey";

-- DropForeignKey
ALTER TABLE "student_scores" DROP CONSTRAINT "student_scores_class_arm_id_fkey";

-- DropForeignKey
ALTER TABLE "student_scores" DROP CONSTRAINT "student_scores_component_id_fkey";

-- DropForeignKey
ALTER TABLE "student_scores" DROP CONSTRAINT "student_scores_entered_by_fkey";

-- DropForeignKey
ALTER TABLE "student_scores" DROP CONSTRAINT "student_scores_school_id_fkey";

-- DropForeignKey
ALTER TABLE "student_scores" DROP CONSTRAINT "student_scores_session_id_fkey";

-- DropForeignKey
ALTER TABLE "student_scores" DROP CONSTRAINT "student_scores_student_id_fkey";

-- DropForeignKey
ALTER TABLE "student_scores" DROP CONSTRAINT "student_scores_subject_id_fkey";

-- DropForeignKey
ALTER TABLE "student_scores" DROP CONSTRAINT "student_scores_term_id_fkey";

-- DropTable
DROP TABLE "assessment_components";

-- DropTable
DROP TABLE "student_scores";

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_scores" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "raw_score" DECIMAL(5,2),
    "is_absent" BOOLEAN NOT NULL DEFAULT false,
    "entered_by" UUID,
    "entered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evaluation_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "name" TEXT,
    "created_by" UUID NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_scores" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "raw_score" DECIMAL(5,2),
    "is_absent" BOOLEAN NOT NULL DEFAULT false,
    "entered_by" UUID,
    "entered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_subject_exam_results" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "total_score" DECIMAL(5,2) NOT NULL,
    "auto_grade" TEXT,
    "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_subject_exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_exam_results" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "term_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "average_score" DECIMAL(5,2) NOT NULL,
    "average_grade" TEXT,
    "exam_position" INTEGER,
    "subjects_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "year_exam_results" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "average_score" DECIMAL(5,2) NOT NULL,
    "average_grade" TEXT,
    "year_exam_position" INTEGER,
    "terms_count" INTEGER NOT NULL DEFAULT 0,
    "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "year_exam_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evaluations_school_id_class_arm_id_subject_id_term_id_idx" ON "evaluations"("school_id", "class_arm_id", "subject_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_scores_evaluation_id_student_id_key" ON "evaluation_scores"("evaluation_id", "student_id");

-- CreateIndex
CREATE INDEX "exams_school_id_class_arm_id_subject_id_term_id_idx" ON "exams"("school_id", "class_arm_id", "subject_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_scores_exam_id_student_id_key" ON "exam_scores"("exam_id", "student_id");

-- CreateIndex
CREATE INDEX "term_subject_exam_results_school_id_class_arm_id_subject_id_idx" ON "term_subject_exam_results"("school_id", "class_arm_id", "subject_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "term_subject_exam_results_student_id_subject_id_term_id_ses_key" ON "term_subject_exam_results"("student_id", "subject_id", "term_id", "session_id");

-- CreateIndex
CREATE INDEX "term_exam_results_school_id_class_arm_id_term_id_idx" ON "term_exam_results"("school_id", "class_arm_id", "term_id");

-- CreateIndex
CREATE UNIQUE INDEX "term_exam_results_student_id_term_id_session_id_key" ON "term_exam_results"("student_id", "term_id", "session_id");

-- CreateIndex
CREATE INDEX "year_exam_results_school_id_session_id_idx" ON "year_exam_results"("school_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "year_exam_results_student_id_session_id_key" ON "year_exam_results"("student_id", "session_id");

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_scores" ADD CONSTRAINT "exam_scores_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_scores" ADD CONSTRAINT "exam_scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_scores" ADD CONSTRAINT "exam_scores_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_exam_results" ADD CONSTRAINT "term_subject_exam_results_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_exam_results" ADD CONSTRAINT "term_subject_exam_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_exam_results" ADD CONSTRAINT "term_subject_exam_results_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_exam_results" ADD CONSTRAINT "term_subject_exam_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_exam_results" ADD CONSTRAINT "term_subject_exam_results_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_subject_exam_results" ADD CONSTRAINT "term_subject_exam_results_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_exam_results" ADD CONSTRAINT "term_exam_results_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_exam_results" ADD CONSTRAINT "term_exam_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_exam_results" ADD CONSTRAINT "term_exam_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_exam_results" ADD CONSTRAINT "term_exam_results_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_exam_results" ADD CONSTRAINT "term_exam_results_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_exam_results" ADD CONSTRAINT "year_exam_results_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_exam_results" ADD CONSTRAINT "year_exam_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "year_exam_results" ADD CONSTRAINT "year_exam_results_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-added CHECK constraints (Prisma's DSL can't express these) — same
-- mutually-exclusive rawScore/isAbsent shape student_scores had.
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_raw_score_or_absent_check"
  CHECK (NOT (raw_score IS NOT NULL AND is_absent = true));

ALTER TABLE "exam_scores" ADD CONSTRAINT "exam_scores_raw_score_or_absent_check"
  CHECK (NOT (raw_score IS NOT NULL AND is_absent = true));
