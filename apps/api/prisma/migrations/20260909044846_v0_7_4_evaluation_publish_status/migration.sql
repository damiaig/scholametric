-- v0.7.4 step 1 (SPEC_V0.7.4.md §2) — publish moves to the individual
-- evaluation; the subject no longer has its own publish action. A
-- subject's term_subject_result.status/total_score are now DERIVED from
-- its evaluations' own published state (GradesService.recomputeStudents),
-- not set by a separate subject-level publish() call. Additive only:
-- every existing evaluation row defaults to DRAFT, matching "nothing is
-- published until a teacher explicitly publishes it" for pre-existing data.
--
-- NOTE: `prisma migrate diff` also proposed DROP INDEX for
-- students_first_name_trgm_idx / students_last_name_trgm_idx here — same
-- known false positive every prior migration in this repo has hit (hand-
-- added gin_trgm_ops indexes, untracked by schema.prisma's DSL). Removed
-- from this file; do not reintroduce.

-- AlterTable
ALTER TABLE "evaluations" ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "status" "ResultStatus" NOT NULL DEFAULT 'DRAFT';
