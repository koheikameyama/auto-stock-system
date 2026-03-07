-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "delistingDate" DATE,
ADD COLUMN     "delistingNewsDetected" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "jpxLastSyncDate" DATE,
ADD COLUMN     "jpxSectorCode" TEXT,
ADD COLUMN     "jpxSectorName" TEXT,
ADD COLUMN     "statusUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "supervisionFlag" TEXT,
ADD COLUMN     "tradingHaltFlag" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "StockStatusLog" (
    "id" TEXT NOT NULL,
    "tickerCode" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "source" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockStatusLog_tickerCode_idx" ON "StockStatusLog"("tickerCode");

-- CreateIndex
CREATE INDEX "StockStatusLog_createdAt_idx" ON "StockStatusLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Stock_isActive_idx" ON "Stock"("isActive");

-- CreateIndex
CREATE INDEX "Stock_isRestricted_idx" ON "Stock"("isRestricted");
