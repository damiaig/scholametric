-- NOTE: prisma migrate diff wanted to DROP students_first_name_trgm_idx /
-- students_last_name_trgm_idx here too — both are hand-added (initial
-- migration; Prisma's index DSL can't express gin_trgm_ops) and untracked
-- by schema.prisma, so any unrelated schema change makes Prisma see them as
-- "extra" and want them gone. Removed from this migration by hand, same as
-- the v0.5 migration before it — never touch these two indexes as a side
-- effect of an unrelated change. See docs/DECISIONS.md.

-- AlterTable
-- SPEC_V0.6.md §4: email becomes optional — STUDENT/PARENT portal accounts
-- log in by username (added below), not email; staff are unaffected (every
-- staff row keeps a real email, enforced at the API layer, not by NOT NULL).
-- A standard unique index tolerates any number of NULLs in Postgres, so
-- `users_school_id_email_key` needs no changes to keep working for staff.
ALTER TABLE "users" ADD COLUMN     "guardian_id" UUID,
ADD COLUMN     "student_id" UUID,
ADD COLUMN     "username" CITEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateIndex
-- One portal STUDENT account per student.
CREATE UNIQUE INDEX "users_student_id_key" ON "users"("student_id");

-- CreateIndex
-- One portal PARENT account per anchor guardian (SPEC_V0.6.md §2.2c) — and
-- since families are disjoint connected components with one anchor
-- guardian each (portal-accounts.service.ts), this transitively guarantees
-- one parent account per family.
CREATE UNIQUE INDEX "users_guardian_id_key" ON "users"("guardian_id");

-- CreateIndex
-- The hard school-wide username-uniqueness guarantee (SPEC_V0.6.md §2.2,
-- guarantee #3) — belt-and-braces alongside by-construction codes and the
-- free-name check in portal-accounts.service.ts.
CREATE UNIQUE INDEX "users_school_id_username_key" ON "users"("school_id", "username");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A STUDENT account links a student and nothing else; a PARENT account
-- links a guardian and nothing else; every other role links neither. A
-- data-integrity invariant (an uninterpretable row otherwise), not a
-- business rule that could change — belongs at the DB layer regardless of
-- which future write path produces the row, same reasoning as v0.5's
-- student_scores_raw_score_or_absent_check. portal-accounts.service.ts
-- enforces the same rule again at the API layer.
ALTER TABLE "users" ADD CONSTRAINT "users_role_link_consistency_check" CHECK (
  (role = 'STUDENT' AND student_id IS NOT NULL AND guardian_id IS NULL) OR
  (role = 'PARENT' AND guardian_id IS NOT NULL AND student_id IS NULL) OR
  (role NOT IN ('STUDENT', 'PARENT') AND student_id IS NULL AND guardian_id IS NULL)
);
