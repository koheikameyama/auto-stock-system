-- AlterTable: PortfolioStock - Replace statusType with recommendation
ALTER TABLE "PortfolioStock" ADD COLUMN "recommendation" TEXT;

-- Migrate existing statusType data to recommendation
UPDATE "PortfolioStock"
SET "recommendation" = CASE
  WHEN "statusType" IN ('即時売却', '戻り売り', '売却検討') THEN 'sell'
  WHEN "statusType" IN ('全力買い', '押し目買い') THEN 'buy'
  WHEN "statusType" = 'ホールド' THEN 'hold'
  ELSE NULL
END
WHERE "statusType" IS NOT NULL;

ALTER TABLE "PortfolioStock" DROP COLUMN "statusType";

-- AlterTable: StockAnalysis - Remove statusType
ALTER TABLE "StockAnalysis" DROP COLUMN "statusType";
