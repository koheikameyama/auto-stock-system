-- AlterTable
ALTER TABLE "ScoringRecord" ADD COLUMN     "closingPrice" DECIMAL(10,2),
ADD COLUMN     "entryPrice" DECIMAL(10,2),
ADD COLUMN     "ghostAnalysis" TEXT,
ADD COLUMN     "ghostProfitPct" DECIMAL(8,4),
ADD COLUMN     "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "ScoringRecord_rejectionReason_idx" ON "ScoringRecord"("rejectionReason");
