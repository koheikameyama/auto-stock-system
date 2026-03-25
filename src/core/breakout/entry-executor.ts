/**
 * ブレイクアウト戦略のエントリーエグゼキューター
 *
 * ブレイクアウトトリガーを受け取り、以下のフローを実行する:
 * 1. 今日のMarketAssessmentでshouldTradeを確認
 * 2. 買い余力チェック（ローカル計算）
 * 3. SL価格 = currentPrice - ATR(14) × 1.0（最大3%）
 * 4. ポジションサイズ = リスク金額（資金の2%） / (currentPrice - SL)、100株単位切捨て
 * 5. TradingOrderをDBに作成
 * 6. submitBrokerOrder()でブローカー発注（シミュレーションモードはスキップ）
 * 7. Slack通知
 */

import { prisma } from "../../lib/prisma";
import { getTodayForDB } from "../../lib/date-utils";
import { getCashBalance, getEffectiveCapital } from "../position-manager";
import { canOpenPosition } from "../risk-manager";
import { submitOrder as submitBrokerOrder } from "../broker-orders";
import { notifyOrderPlaced, notifySlack } from "../../lib/slack";
import { STOP_LOSS, POSITION_SIZING, UNIT_SHARES } from "../../lib/constants";
import { BREAKOUT } from "../../lib/constants/breakout";
import type { BreakoutTrigger } from "./types";

export interface ExecutionResult {
  success: boolean;
  orderId?: string;
  reason?: string;
}

/**
 * ブレイクアウトトリガーのエントリー実行
 *
 * @param trigger ブレイクアウトトリガーイベント
 * @param brokerMode ブローカーモード（"simulation" | "dry_run" | "live"）
 */
export async function executeEntry(
  trigger: BreakoutTrigger,
  brokerMode: string,
): Promise<ExecutionResult> {
  const { ticker, currentPrice, atr14 } = trigger;

  // 0. 共有データを並列で一括取得（重複クエリ削減）
  const [todayAssessment, stock, cashBalance, effectiveCapital, config, openPositions] =
    await Promise.all([
      prisma.marketAssessment.findUnique({ where: { date: getTodayForDB() } }),
      prisma.stock.findUnique({ where: { tickerCode: ticker } }),
      getCashBalance(),
      getEffectiveCapital(),
      prisma.tradingConfig.findFirst({ orderBy: { createdAt: "desc" } }),
      prisma.tradingPosition.findMany({
        where: { status: "open" },
        include: { stock: { select: { id: true, jpxSectorName: true, tickerCode: true } } },
      }),
    ]);

  // 1. shouldTrade確認
  if (!todayAssessment || !todayAssessment.shouldTrade) {
    const reason = !todayAssessment
      ? "今日のMarketAssessmentがありません"
      : "今日は取引見送り（shouldTrade=false）";
    console.log(`[entry-executor] ${ticker} スキップ: ${reason}`);
    return { success: false, reason };
  }

  // 2. 銘柄マスタ確認
  if (!stock) {
    const reason = `銘柄マスタに存在しません: ${ticker}`;
    console.log(`[entry-executor] ${reason}`);
    return { success: false, reason };
  }

  // 3. SL価格 = currentPrice - ATR × 1.0（最大3%に制限）
  const rawStopLoss = currentPrice - atr14 * BREAKOUT.STOP_LOSS.ATR_MULTIPLIER;
  const maxStopLoss = currentPrice * (1 - STOP_LOSS.MAX_LOSS_PCT);
  const stopLossPrice = Math.round(Math.max(rawStopLoss, maxStopLoss));

  const slRiskPct = (currentPrice - stopLossPrice) / currentPrice;
  const isSLClamped = rawStopLoss < maxStopLoss;
  if (isSLClamped) {
    console.log(
      `[entry-executor] ${ticker} SL: ATRベース ¥${Math.round(rawStopLoss)} → 3%上限に制限 ¥${stopLossPrice}（${(slRiskPct * 100).toFixed(2)}%）`,
    );
  }

  // 4. ポジションサイズ計算
  const riskAmount = effectiveCapital * (POSITION_SIZING.RISK_PER_TRADE_PCT / 100);
  const riskPerShare = currentPrice - stopLossPrice;

  if (riskPerShare <= 0) {
    const reason = `SLがエントリー価格以上のため数量計算不可（SL: ¥${stopLossPrice}, entry: ¥${currentPrice}）`;
    console.log(`[entry-executor] ${ticker} スキップ: ${reason}`);
    return { success: false, reason };
  }

  const rawQuantity = Math.floor(riskAmount / riskPerShare);
  const quantity = Math.floor(rawQuantity / UNIT_SHARES) * UNIT_SHARES;

  if (quantity === 0) {
    const reason = `予算不足でポジションサイズが0（余力: ¥${cashBalance.toLocaleString()}, 必要リスク額: ¥${riskAmount.toLocaleString()}）`;
    console.log(`[entry-executor] ${ticker} スキップ: ${reason}`);
    return { success: false, reason };
  }

  // 残高チェック
  const requiredAmount = currentPrice * quantity;
  if (cashBalance < requiredAmount) {
    const reason = `残高不足（必要: ¥${requiredAmount.toLocaleString()}, 残高: ¥${cashBalance.toLocaleString()}）`;
    console.log(`[entry-executor] ${ticker} スキップ: ${reason}`);
    return { success: false, reason };
  }

  // 5. canOpenPosition でセクター集中・ドローダウン・ポジション数を確認（プリフェッチデータを渡す）
  const riskCheck = await canOpenPosition(stock.id, quantity, currentPrice, {
    config: config ?? undefined,
    openPositions,
    effectiveCapital,
  });
  if (!riskCheck.allowed) {
    console.log(`[entry-executor] ${ticker} リスクチェック不可: ${riskCheck.reason}`);
    return { success: false, reason: riskCheck.reason };
  }

  // 利確参考値: ATR × 5.0（トレーリングストップが実際の利確を担う）
  const takeProfitPrice = Math.round(currentPrice + atr14 * 5.0);

  // 6. TradingOrderをDBに作成
  const newOrder = await prisma.tradingOrder.create({
    data: {
      stockId: stock.id,
      side: "buy",
      orderType: "limit",
      strategy: "breakout",
      limitPrice: currentPrice,
      takeProfitPrice,
      stopLossPrice,
      quantity,
      status: "pending",
      reasoning: `ブレイクアウトトリガー: 出来高サージ比率 ${trigger.volumeSurgeRatio.toFixed(2)}x, 20日高値 ¥${trigger.high20} 突破`,
      entrySnapshot: {
        trigger: {
          ticker: trigger.ticker,
          currentPrice: trigger.currentPrice,
          volumeSurgeRatio: trigger.volumeSurgeRatio,
          high20: trigger.high20,
          atr14: trigger.atr14,
          triggeredAt: trigger.triggeredAt.toISOString(),
        },
        slClamped: isSLClamped,
        riskPct: POSITION_SIZING.RISK_PER_TRADE_PCT,
      },
    },
  });

  console.log(
    `[entry-executor] ${ticker} 注文作成: id=${newOrder.id}, 指値=¥${currentPrice}, SL=¥${stopLossPrice}, TP=¥${takeProfitPrice}, 数量=${quantity}株`,
  );

  // 7. ブローカー発注（simulationモードはスキップ）
  if (brokerMode !== "simulation") {
    try {
      const brokerResult = await submitBrokerOrder({
        ticker,
        side: "buy",
        quantity,
        limitPrice: currentPrice,
        stopTriggerPrice: stopLossPrice,
        stopOrderPrice: undefined, // SL成行
      });

      if (brokerResult.success && brokerResult.orderNumber) {
        await prisma.tradingOrder.update({
          where: { id: newOrder.id },
          data: {
            brokerOrderId: brokerResult.orderNumber,
            brokerBusinessDay: brokerResult.businessDay,
          },
        });
        console.log(
          `[entry-executor] ${ticker} ブローカー発注成功: orderNumber=${brokerResult.orderNumber}`,
        );
      } else if (!brokerResult.success && !brokerResult.isDryRun) {
        console.warn(
          `[entry-executor] ブローカー発注失敗: ${ticker}: ${brokerResult.error}`,
        );
        await notifySlack({
          title: `ブローカー発注失敗: ${ticker}`,
          message: brokerResult.error ?? "Unknown error",
          color: "danger",
        });
      }
    } catch (brokerErr) {
      console.error(`[entry-executor] ブローカーエラー ${ticker}:`, brokerErr);
    }
  }

  // 8. Slack通知
  await notifyOrderPlaced({
    tickerCode: ticker,
    name: stock.name,
    side: "buy",
    strategy: "breakout",
    limitPrice: currentPrice,
    takeProfitPrice,
    stopLossPrice,
    quantity,
    reasoning: `ブレイクアウトトリガー: 出来高サージ ${trigger.volumeSurgeRatio.toFixed(2)}x / 20日高値 ¥${trigger.high20} 突破`,
  });

  return { success: true, orderId: newOrder.id };
}
