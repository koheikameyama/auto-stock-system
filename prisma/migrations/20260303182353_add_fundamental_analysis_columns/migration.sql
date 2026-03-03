-- AlterTable
ALTER TABLE "SectorTrend" ADD COLUMN     "avgPBR" DOUBLE PRECISION,
ADD COLUMN     "avgPER" DOUBLE PRECISION,
ADD COLUMN     "avgROE" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Stock" ADD COLUMN     "currentRatio" DECIMAL(8,2),
ADD COLUMN     "debtEquityRatio" DECIMAL(8,2),
ADD COLUMN     "dividendGrowthRate" DECIMAL(8,2),
ADD COLUMN     "payoutRatio" DECIMAL(8,2);
