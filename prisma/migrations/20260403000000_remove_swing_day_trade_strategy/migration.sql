-- データマイグレーション: swing/day_trade戦略をbreakoutに統合
-- swing/day_tradeはコードから完全削除されたため、既存レコードをbreakoutに変換

UPDATE "MarketAssessment" SET "tradingStrategy" = 'breakout' WHERE "tradingStrategy" IN ('swing', 'day_trade');
UPDATE "TradingOrder" SET "strategy" = 'breakout' WHERE "strategy" IN ('swing', 'day_trade');
UPDATE "TradingPosition" SET "strategy" = 'breakout' WHERE "strategy" IN ('swing', 'day_trade');
