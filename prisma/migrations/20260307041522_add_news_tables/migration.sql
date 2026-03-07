-- CreateTable
CREATE TABLE "NewsArticle" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "tickerCode" TEXT,
    "sector" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsAnalysis" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "geopoliticalRiskLevel" INTEGER NOT NULL,
    "geopoliticalSummary" TEXT NOT NULL,
    "marketImpact" TEXT NOT NULL,
    "marketImpactSummary" TEXT NOT NULL,
    "sectorImpacts" JSONB NOT NULL,
    "stockCatalysts" JSONB NOT NULL,
    "keyEvents" TEXT NOT NULL,
    "articleCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsArticle_contentHash_key" ON "NewsArticle"("contentHash");

-- CreateIndex
CREATE INDEX "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "NewsArticle_category_idx" ON "NewsArticle"("category");

-- CreateIndex
CREATE INDEX "NewsArticle_tickerCode_idx" ON "NewsArticle"("tickerCode");

-- CreateIndex
CREATE UNIQUE INDEX "NewsAnalysis_date_key" ON "NewsAnalysis"("date");

-- CreateIndex
CREATE INDEX "NewsAnalysis_date_idx" ON "NewsAnalysis"("date" DESC);
