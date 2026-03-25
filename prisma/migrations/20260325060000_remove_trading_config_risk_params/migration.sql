-- リスクパラメータを定数管理に移行（TRADING_DEFAULTS で管理）
ALTER TABLE "TradingConfig" DROP COLUMN "maxPositions";
ALTER TABLE "TradingConfig" DROP COLUMN "maxPositionPct";
ALTER TABLE "TradingConfig" DROP COLUMN "maxDailyLossPct";
