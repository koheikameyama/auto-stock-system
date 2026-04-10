-- AlterTable: TradingPosition から realizedPnl カラムを削除
-- 導出値（entryPrice, exitPrice, quantity から計算可能）のため不要
ALTER TABLE "TradingPosition" DROP COLUMN "realizedPnl";
