-- AlterTable
ALTER TABLE "MarketNews" ADD COLUMN "tickerCode" TEXT;

-- CreateIndex
CREATE INDEX "MarketNews_tickerCode_idx" ON "MarketNews"("tickerCode");

-- CreateIndex
CREATE UNIQUE INDEX "MarketNews_url_tickerCode_key" ON "MarketNews"("url", "tickerCode");
