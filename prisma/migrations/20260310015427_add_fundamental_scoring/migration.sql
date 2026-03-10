-- AlterTable
ALTER TABLE "ScoringRecord" ADD COLUMN     "fundamentalBreakdown" JSONB,
ADD COLUMN     "fundamentalScore" INTEGER NOT NULL DEFAULT 0;
