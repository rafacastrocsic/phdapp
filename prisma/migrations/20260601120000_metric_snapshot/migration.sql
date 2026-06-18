-- Daily adoption-metrics snapshot. One row per UTC day (upserted).

CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "mau" INTEGER NOT NULL,
    "wau" INTEGER NOT NULL,
    "tasksCompleted30" INTEGER NOT NULL,
    "messages7" INTEGER NOT NULL,
    "checkinRatePct" INTEGER,
    "meetingsWithNotes" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetricSnapshot_day_key" ON "MetricSnapshot"("day");
