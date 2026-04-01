-- DropIndex
DROP INDEX "BacktestRun_runAt_idx";

-- CreateTable
CREATE TABLE "MarketForecast" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "marketData" JSONB NOT NULL,
    "newsHeadlines" JSONB,
    "outlook" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "keyFactors" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "tradingHints" TEXT,

    CONSTRAINT "MarketForecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketForecast_date_idx" ON "MarketForecast"("date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MarketForecast_date_key" ON "MarketForecast"("date");
