-- AlterTable
ALTER TABLE "TradingOrder" ADD COLUMN     "stopLossPrice" DECIMAL(10,2),
ADD COLUMN     "takeProfitPrice" DECIMAL(10,2);
