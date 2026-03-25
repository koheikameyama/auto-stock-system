-- CreateTable
CREATE TABLE "BreakoutWatchlistEntry" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tickerCode" TEXT NOT NULL,
    "avgVolume25" DOUBLE PRECISION NOT NULL,
    "high20" DOUBLE PRECISION NOT NULL,
    "atr14" DOUBLE PRECISION NOT NULL,
    "latestClose" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreakoutWatchlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BreakoutWatchlistEntry_date_idx" ON "BreakoutWatchlistEntry"("date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "BreakoutWatchlistEntry_date_tickerCode_key" ON "BreakoutWatchlistEntry"("date", "tickerCode");
