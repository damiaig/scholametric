-- v0.8.5 step 2 (SPEC_V0.8.5.md §5) — add family_id + family_sequence to
-- refresh_tokens, additive and backward-compatible with every row that
-- already exists.

-- AlterTable: add both columns nullable first (a non-empty table can't
-- take a required column with no default in one step).
ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" UUID;
ALTER TABLE "refresh_tokens" ADD COLUMN "family_sequence" INTEGER;

-- Backfill: every existing row becomes its own single-token family root
-- (its own id doubles as its family_id, sequence 0 — there is no prior
-- chain to reconstruct, and none is needed: a pre-existing active token
-- simply starts a brand new one-token family from here on).
UPDATE "refresh_tokens" SET "family_id" = "id", "family_sequence" = 0 WHERE "family_id" IS NULL;

-- Now safe to enforce NOT NULL — every row has a value.
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_sequence" SET NOT NULL;

-- CreateIndex: the reuse-detection discriminator's own lookup, and a hard
-- invariant — a duplicate sequence within one family is a logic bug that
-- must fail loudly (constraint violation), never corrupt data silently.
CREATE UNIQUE INDEX "refresh_tokens_family_id_family_sequence_key" ON "refresh_tokens"("family_id", "family_sequence");
