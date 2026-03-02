-- UserDailyRecommendation: カラム名変更（利確/損切り → 売却目標/撤退ライン）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserDailyRecommendation' AND column_name = 'takeProfitRate') THEN
    ALTER TABLE "UserDailyRecommendation" RENAME COLUMN "takeProfitRate" TO "sellTargetRate";
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserDailyRecommendation' AND column_name = 'stopLossRate') THEN
    ALTER TABLE "UserDailyRecommendation" RENAME COLUMN "stopLossRate" TO "exitRate";
  END IF;
END $$;
