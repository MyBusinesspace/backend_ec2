-- AlterTable: Add new columns to refresh_tokens
ALTER TABLE "refresh_tokens" ADD COLUMN     "device_fingerprint" TEXT,
ADD COLUMN     "family_id" TEXT,
ADD COLUMN     "replaced_by_token" TEXT,
ADD COLUMN     "rotated_at" TIMESTAMPTZ(6);

-- Set family_id to id for existing rows (each existing token is its own family)
UPDATE "refresh_tokens" SET "family_id" = "id"::text WHERE "family_id" IS NULL;

-- Now make family_id NOT NULL
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;

-- AlterTable: Add tokenVersion to users
ALTER TABLE "users" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_family_id" ON "refresh_tokens"("family_id");
