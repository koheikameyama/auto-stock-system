-- 既存データを削除（資金ティア→パラメータ条件に構造変更のため）
DELETE FROM "BacktestDailyResult";

-- budgetTier カラムを削除
ALTER TABLE "BacktestDailyResult" DROP COLUMN "budgetTier";

-- conditionKey / conditionLabel カラムを追加
ALTER TABLE "BacktestDailyResult" ADD COLUMN "conditionKey" TEXT NOT NULL;
ALTER TABLE "BacktestDailyResult" ADD COLUMN "conditionLabel" TEXT NOT NULL;

-- 旧ユニーク制約を削除
DROP INDEX IF EXISTS "BacktestDailyResult_date_budgetTier_key";

-- 新ユニーク制約を作成
CREATE UNIQUE INDEX "BacktestDailyResult_date_conditionKey_key" ON "BacktestDailyResult"("date", "conditionKey");
