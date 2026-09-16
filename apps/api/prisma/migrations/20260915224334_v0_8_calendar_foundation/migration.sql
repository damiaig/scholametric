-- v0.8 step 1 (SPEC_V0.8.md §7 item 1) — the calendar domain's foundation.
-- Purely additive: four new tables (periods, breaks, holidays,
-- class_school_days), no existing table altered.
--
-- NOTE: `prisma migrate diff` also proposed DROP INDEX for
-- students_first_name_trgm_idx / students_last_name_trgm_idx here — same
-- known false positive every prior migration in this repo has hit (hand-
-- added gin_trgm_ops indexes, untracked by schema.prisma's DSL). Removed
-- from this file; do not reintroduce.

-- CreateTable
CREATE TABLE "periods" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" VARCHAR(5) NOT NULL,
    "ends_at" VARCHAR(5) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breaks" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" VARCHAR(5) NOT NULL,
    "ends_at" VARCHAR(5) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "term_id" UUID,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_school_days" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "class_arm_id" UUID NOT NULL,
    "includes_saturday" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_school_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "periods_school_id_idx" ON "periods"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "periods_school_id_name_key" ON "periods"("school_id", "name");

-- CreateIndex
CREATE INDEX "breaks_school_id_idx" ON "breaks"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "breaks_school_id_name_key" ON "breaks"("school_id", "name");

-- CreateIndex
CREATE INDEX "holidays_school_id_session_id_idx" ON "holidays"("school_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_school_days_class_arm_id_key" ON "class_school_days"("class_arm_id");

-- CreateIndex
CREATE INDEX "class_school_days_school_id_idx" ON "class_school_days"("school_id");

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breaks" ADD CONSTRAINT "breaks_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "academic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_school_days" ADD CONSTRAINT "class_school_days_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_school_days" ADD CONSTRAINT "class_school_days_class_arm_id_fkey" FOREIGN KEY ("class_arm_id") REFERENCES "class_arms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
