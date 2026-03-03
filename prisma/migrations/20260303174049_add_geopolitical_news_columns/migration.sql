-- AlterTable
ALTER TABLE "MarketNews" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'stock',
ADD COLUMN     "impactDirection" TEXT,
ADD COLUMN     "impactSectors" TEXT,
ADD COLUMN     "impactSummary" TEXT;

-- CreateIndex
CREATE INDEX "MarketNews_category_idx" ON "MarketNews"("category");
