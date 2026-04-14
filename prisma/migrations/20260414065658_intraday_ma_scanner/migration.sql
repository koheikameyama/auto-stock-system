-- AlterTable
ALTER TABLE "WatchlistEntry" ADD COLUMN     "ma20" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "IntraDayMaPullbackSignal" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "tickerCode" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "ma20" DOUBLE PRECISION NOT NULL,
    "detectedPrice" DOUBLE PRECISION NOT NULL,
    "closePrice" DOUBLE PRECISION,
    "stopLossPrice" DOUBLE PRECISION NOT NULL,
    "atr14" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntraDayMaPullbackSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntraDayMaPullbackSignal_date_idx" ON "IntraDayMaPullbackSignal"("date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "IntraDayMaPullbackSignal_date_tickerCode_key" ON "IntraDayMaPullbackSignal"("date", "tickerCode");
