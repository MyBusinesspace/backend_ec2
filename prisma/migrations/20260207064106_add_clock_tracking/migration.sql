-- CreateTable
CREATE TABLE "clock_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "clock_in_time" TIMESTAMPTZ(6) NOT NULL,
    "clock_in_lat" DOUBLE PRECISION,
    "clock_in_lng" DOUBLE PRECISION,
    "clock_in_address" TEXT,
    "clock_out_time" TIMESTAMPTZ(6),
    "clock_out_lat" DOUBLE PRECISION,
    "clock_out_lng" DOUBLE PRECISION,
    "clock_out_address" TEXT,
    "duration_minutes" INTEGER,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clock_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clock_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clock_entry_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "altitude" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "timestamp" TIMESTAMPTZ(6) NOT NULL,
    "address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_clock_entries_company_id" ON "clock_entries"("company_id");

-- CreateIndex
CREATE INDEX "idx_clock_entries_user_id" ON "clock_entries"("user_id");

-- CreateIndex
CREATE INDEX "idx_clock_entries_task_id" ON "clock_entries"("task_id");

-- CreateIndex
CREATE INDEX "idx_clock_entries_clock_in_time" ON "clock_entries"("clock_in_time");

-- CreateIndex
CREATE INDEX "idx_clock_entries_is_active" ON "clock_entries"("is_active");

-- CreateIndex
CREATE INDEX "idx_clock_entries_user_active" ON "clock_entries"("user_id", "is_active");

-- CreateIndex
CREATE INDEX "idx_clock_locations_clock_entry_id" ON "clock_locations"("clock_entry_id");

-- CreateIndex
CREATE INDEX "idx_clock_locations_timestamp" ON "clock_locations"("timestamp");

-- AddForeignKey
ALTER TABLE "clock_entries" ADD CONSTRAINT "clock_entries_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clock_entries" ADD CONSTRAINT "clock_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clock_entries" ADD CONSTRAINT "clock_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clock_locations" ADD CONSTRAINT "clock_locations_clock_entry_id_fkey" FOREIGN KEY ("clock_entry_id") REFERENCES "clock_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
