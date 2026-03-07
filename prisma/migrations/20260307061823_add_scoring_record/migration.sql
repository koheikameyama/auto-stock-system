-- CreateTable
CREATE TABLE "ScoringRecord" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "tickerCode" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "rank" TEXT NOT NULL,
    "technicalScore" INTEGER NOT NULL,
    "patternScore" INTEGER NOT NULL,
    "liquidityScore" INTEGER NOT NULL,
    "technicalBreakdown" JSONB NOT NULL,
    "patternBreakdown" JSONB NOT NULL,
    "liquidityBreakdown" JSONB NOT NULL,
    "isDisqualified" BOOLEAN NOT NULL DEFAULT false,
    "disqualifyReason" TEXT,
    "aiDecision" TEXT,
    "aiReasoning" TEXT,
    "tradingOrderId" TEXT,
    "tradeResult" TEXT,
    "profitPct" DECIMAL(8,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoringRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRecord_tradingOrderId_key" ON "ScoringRecord"("tradingOrderId");

-- CreateIndex
CREATE INDEX "ScoringRecord_date_idx" ON "ScoringRecord"("date" DESC);

-- CreateIndex
CREATE INDEX "ScoringRecord_rank_idx" ON "ScoringRecord"("rank");

-- CreateIndex
CREATE INDEX "ScoringRecord_tradeResult_idx" ON "ScoringRecord"("tradeResult");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRecord_date_tickerCode_key" ON "ScoringRecord"("date", "tickerCode");
