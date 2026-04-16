-- CreateTable
CREATE TABLE "RejectedSignal" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "rejectedAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonLabel" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "close5d" DOUBLE PRECISION,
    "close10d" DOUBLE PRECISION,
    "return5dPct" DOUBLE PRECISION,
    "return10dPct" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectedSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RejectedSignal_rejectedAt_idx" ON "RejectedSignal"("rejectedAt" DESC);

-- CreateIndex
CREATE INDEX "RejectedSignal_ticker_idx" ON "RejectedSignal"("ticker");
