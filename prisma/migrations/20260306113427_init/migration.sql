-- CreateTable
CREATE TABLE "Stock" (
    "id" TEXT NOT NULL,
    "tickerCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "sector" TEXT,
    "marketCap" DECIMAL(65,30),
    "dividendYield" DECIMAL(65,30),
    "pbr" DECIMAL(8,2),
    "per" DECIMAL(8,2),
    "roe" DECIMAL(8,4),
    "eps" DECIMAL(12,2),
    "isProfitable" BOOLEAN,
    "latestPrice" DECIMAL(12,2),
    "latestVolume" BIGINT,
    "dailyChangeRate" DECIMAL(8,2),
    "weekChangeRate" DECIMAL(8,2),
    "volatility" DECIMAL(8,2),
    "atr14" DECIMAL(12,2),
    "latestPriceDate" DATE,
    "priceUpdatedAt" TIMESTAMP(3),
    "fetchFailCount" INTEGER NOT NULL DEFAULT 0,
    "isDelisted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingConfig" (
    "id" TEXT NOT NULL,
    "totalBudget" DECIMAL(12,0) NOT NULL,
    "maxPositions" INTEGER NOT NULL DEFAULT 5,
    "maxPositionPct" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "maxDailyLossPct" DECIMAL(5,2) NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketAssessment" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nikkeiPrice" DECIMAL(10,2),
    "nikkeiChange" DECIMAL(8,4),
    "sp500Change" DECIMAL(8,4),
    "vix" DECIMAL(8,2),
    "usdjpy" DECIMAL(8,4),
    "cmeFuturesPrice" DECIMAL(10,2),
    "sentiment" TEXT NOT NULL,
    "shouldTrade" BOOLEAN NOT NULL,
    "reasoning" TEXT NOT NULL,
    "selectedStocks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingOrder" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "limitPrice" DECIMAL(10,2),
    "stopPrice" DECIMAL(10,2),
    "quantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "filledPrice" DECIMAL(10,2),
    "filledAt" TIMESTAMP(3),
    "reasoning" TEXT NOT NULL,
    "positionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "TradingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingPosition" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "entryPrice" DECIMAL(10,2) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "takeProfitPrice" DECIMAL(10,2),
    "stopLossPrice" DECIMAL(10,2),
    "status" TEXT NOT NULL DEFAULT 'open',
    "exitPrice" DECIMAL(10,2),
    "exitedAt" TIMESTAMP(3),
    "realizedPnl" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingDailySummary" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "totalPnl" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "portfolioValue" DECIMAL(12,0) NOT NULL,
    "cashBalance" DECIMAL(12,0) NOT NULL,
    "aiReview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradingDailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Stock_tickerCode_key" ON "Stock"("tickerCode");

-- CreateIndex
CREATE INDEX "Stock_tickerCode_idx" ON "Stock"("tickerCode");

-- CreateIndex
CREATE INDEX "Stock_sector_idx" ON "Stock"("sector");

-- CreateIndex
CREATE INDEX "MarketAssessment_date_idx" ON "MarketAssessment"("date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MarketAssessment_date_key" ON "MarketAssessment"("date");

-- CreateIndex
CREATE INDEX "TradingOrder_status_idx" ON "TradingOrder"("status");

-- CreateIndex
CREATE INDEX "TradingOrder_stockId_idx" ON "TradingOrder"("stockId");

-- CreateIndex
CREATE INDEX "TradingOrder_positionId_idx" ON "TradingOrder"("positionId");

-- CreateIndex
CREATE INDEX "TradingOrder_createdAt_idx" ON "TradingOrder"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "TradingPosition_status_idx" ON "TradingPosition"("status");

-- CreateIndex
CREATE INDEX "TradingPosition_stockId_idx" ON "TradingPosition"("stockId");

-- CreateIndex
CREATE INDEX "TradingPosition_createdAt_idx" ON "TradingPosition"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TradingDailySummary_date_key" ON "TradingDailySummary"("date");

-- CreateIndex
CREATE INDEX "TradingDailySummary_date_idx" ON "TradingDailySummary"("date" DESC);

-- AddForeignKey
ALTER TABLE "TradingOrder" ADD CONSTRAINT "TradingOrder_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingOrder" ADD CONSTRAINT "TradingOrder_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "TradingPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingPosition" ADD CONSTRAINT "TradingPosition_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
