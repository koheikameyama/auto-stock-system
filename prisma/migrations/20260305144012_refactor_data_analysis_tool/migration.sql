-- ============================================================
-- Phase 1: データ分析ツールへのリファクタ
-- テーブルリネーム・カラム変更・不要テーブル削除
-- ============================================================

-- ============================================================
-- 1. PurchaseRecommendation → StockReport (リネーム + カラム変更)
-- ============================================================

-- 不要カラム削除
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "recommendation";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "confidence";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "buyTiming";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "dipTargetPrice";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "sellTiming";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "sellTargetPrice";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "userFitScore";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "budgetFit";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "periodFit";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "riskFit";
ALTER TABLE "PurchaseRecommendation" DROP COLUMN IF EXISTS "personalizedReason";

-- カラムリネーム
ALTER TABLE "PurchaseRecommendation" RENAME COLUMN "buyCondition" TO "keyCondition";

-- 新カラム追加
ALTER TABLE "PurchaseRecommendation" ADD COLUMN "technicalScore" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN "fundamentalScore" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN "healthRank" TEXT NOT NULL DEFAULT 'C';
ALTER TABLE "PurchaseRecommendation" ADD COLUMN "alerts" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "PurchaseRecommendation" ADD COLUMN "supportLevel" DOUBLE PRECISION;
ALTER TABLE "PurchaseRecommendation" ADD COLUMN "resistanceLevel" DOUBLE PRECISION;

-- FK削除
ALTER TABLE "PurchaseRecommendation" DROP CONSTRAINT IF EXISTS "PurchaseRecommendation_stockId_fkey";

-- インデックス・制約削除
DROP INDEX IF EXISTS "PurchaseRecommendation_date_idx";
DROP INDEX IF EXISTS "PurchaseRecommendation_stockId_idx";
DROP INDEX IF EXISTS "PurchaseRecommendation_stockId_date_key";

-- テーブルリネーム
ALTER TABLE "PurchaseRecommendation" RENAME TO "StockReport";

-- FK・インデックス再作成
ALTER TABLE "StockReport" ADD CONSTRAINT "StockReport_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "StockReport_date_idx" ON "StockReport"("date");
CREATE INDEX "StockReport_stockId_idx" ON "StockReport"("stockId");
CREATE UNIQUE INDEX "StockReport_stockId_date_key" ON "StockReport"("stockId", "date");

-- PKリネーム
ALTER INDEX "PurchaseRecommendation_pkey" RENAME TO "StockReport_pkey";

-- ============================================================
-- 2. UserDailyRecommendation → DailyHighlight (リネーム + カラム変更)
-- ============================================================

-- FK削除
ALTER TABLE "UserDailyRecommendation" DROP CONSTRAINT IF EXISTS "UserDailyRecommendation_stockId_fkey";
ALTER TABLE "UserDailyRecommendation" DROP CONSTRAINT IF EXISTS "UserDailyRecommendation_userId_fkey";

-- 不要カラム削除
ALTER TABLE "UserDailyRecommendation" DROP COLUMN IF EXISTS "reason";
ALTER TABLE "UserDailyRecommendation" DROP COLUMN IF EXISTS "investmentTheme";
ALTER TABLE "UserDailyRecommendation" DROP COLUMN IF EXISTS "purchaseJudgment";

-- 新カラム追加
ALTER TABLE "UserDailyRecommendation" ADD COLUMN "highlightType" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserDailyRecommendation" ADD COLUMN "highlightReason" TEXT NOT NULL DEFAULT '';

-- インデックス・制約削除
DROP INDEX IF EXISTS "UserDailyRecommendation_userId_date_idx";
DROP INDEX IF EXISTS "UserDailyRecommendation_stockId_idx";
DROP INDEX IF EXISTS "UserDailyRecommendation_userId_date_position_key";

-- テーブルリネーム
ALTER TABLE "UserDailyRecommendation" RENAME TO "DailyHighlight";

-- FK・インデックス再作成
ALTER TABLE "DailyHighlight" ADD CONSTRAINT "DailyHighlight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyHighlight" ADD CONSTRAINT "DailyHighlight_stockId_fkey" FOREIGN KEY ("stockId") REFERENCES "Stock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "DailyHighlight_userId_date_idx" ON "DailyHighlight"("userId", "date" DESC);
CREATE INDEX "DailyHighlight_stockId_idx" ON "DailyHighlight"("stockId");
CREATE UNIQUE INDEX "DailyHighlight_userId_date_position_key" ON "DailyHighlight"("userId", "date", "position");

-- PKリネーム
ALTER INDEX "UserDailyRecommendation_pkey" RENAME TO "DailyHighlight_pkey";

-- ============================================================
-- 3. StockAnalysis カラム変更
-- ============================================================

ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "confidence";
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "limitPrice";
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "stopLossPrice";
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "shortTermPriceLow";
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "shortTermPriceHigh";
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "midTermPriceLow";
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "midTermPriceHigh";
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "longTermPriceLow";
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "longTermPriceHigh";
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "recommendation";
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "sellCondition";
ALTER TABLE "StockAnalysis" DROP COLUMN IF EXISTS "styleAnalyses";

ALTER TABLE "StockAnalysis" ADD COLUMN "healthScore" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "StockAnalysis" ADD COLUMN "riskLevel" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "StockAnalysis" ADD COLUMN "riskFlags" JSONB NOT NULL DEFAULT '[]';

-- ============================================================
-- 4. PortfolioOverallAnalysis: actionPlan → keyPoints
-- ============================================================

ALTER TABLE "PortfolioOverallAnalysis" RENAME COLUMN "actionPlan" TO "keyPoints";

-- ============================================================
-- 5. PortfolioStock カラム変更
-- ============================================================

ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "recommendation";
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "marketSignal";
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "suggestedSellPrice";
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "suggestedSellPercent";
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "sellCondition";
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "sellReason";
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "sellTiming";
ALTER TABLE "PortfolioStock" DROP COLUMN IF EXISTS "sellTargetPrice";

ALTER TABLE "PortfolioStock" ADD COLUMN "riskLevel" TEXT;
ALTER TABLE "PortfolioStock" ADD COLUMN "riskFlags" JSONB;

-- ============================================================
-- 6. WatchlistStock カラム変更
-- ============================================================

ALTER TABLE "WatchlistStock" DROP COLUMN IF EXISTS "investmentTheme";
ALTER TABLE "WatchlistStock" DROP COLUMN IF EXISTS "recommendationReason";

ALTER TABLE "WatchlistStock" ADD COLUMN "highlightType" TEXT;
ALTER TABLE "WatchlistStock" ADD COLUMN "highlightReason" TEXT;

-- ============================================================
-- 7. 不要テーブル削除
-- ============================================================

DROP TABLE IF EXISTS "SwitchProposal";
DROP TABLE IF EXISTS "MarketShield";
DROP TABLE IF EXISTS "RecommendationOutcome";
DROP TABLE IF EXISTS "DailyAIReport";
DROP TABLE IF EXISTS "WeeklyAIReport";
