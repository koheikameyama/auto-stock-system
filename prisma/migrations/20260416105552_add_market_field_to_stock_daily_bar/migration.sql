-- AlterTable
ALTER TABLE "StockDailyBar" ADD COLUMN     "market" TEXT NOT NULL DEFAULT 'JP';

-- CreateIndex
CREATE INDEX "StockDailyBar_market_idx" ON "StockDailyBar"("market");
