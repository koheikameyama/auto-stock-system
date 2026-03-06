/**
 * リスク管理モジュール
 *
 * ポジションサイズ制限・日次損失制限・取引可否判定を行う
 */

import { prisma } from "../lib/prisma";
import { UNIT_SHARES } from "../lib/constants";

/**
 * 新規ポジションを建てられるかチェックする
 *
 * 以下の条件をすべて満たす場合に allowed: true を返す:
 * 1. 取引が有効（isActive）
 * 2. オープンポジション数が maxPositions 未満
 * 3. 現金残高が必要額以上
 * 4. 1銘柄あたりの投資比率が maxPositionPct 以下
 * 5. 日次損失が制限内
 */
export async function canOpenPosition(
  stockId: string,
  quantity: number,
  price: number,
): Promise<{ allowed: boolean; reason: string }> {
  const config = await prisma.tradingConfig.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!config) {
    return { allowed: false, reason: "TradingConfig が設定されていません" };
  }

  if (!config.isActive) {
    return { allowed: false, reason: "取引が無効化されています" };
  }

  const totalBudget = Number(config.totalBudget);
  const maxPositions = config.maxPositions;
  const maxPositionPct = Number(config.maxPositionPct);
  const requiredAmount = price * quantity;

  // 1. オープンポジション数チェック
  const openPositionCount = await prisma.tradingPosition.count({
    where: { status: "open" },
  });

  if (openPositionCount >= maxPositions) {
    return {
      allowed: false,
      reason: `最大同時保有数（${maxPositions}）に達しています（現在: ${openPositionCount}）`,
    };
  }

  // 2. 現金残高チェック
  const openPositions = await prisma.tradingPosition.findMany({
    where: { status: "open" },
  });

  const investedAmount = openPositions.reduce((sum, pos) => {
    return sum + Number(pos.entryPrice) * pos.quantity;
  }, 0);

  const cashBalance = totalBudget - investedAmount;

  if (requiredAmount > cashBalance) {
    return {
      allowed: false,
      reason: `現金残高不足（残高: ${cashBalance.toFixed(0)}円、必要額: ${requiredAmount.toFixed(0)}円）`,
    };
  }

  // 3. 1銘柄あたり最大比率チェック（同一銘柄の既存ポジションも合算）
  const existingAmountForStock = openPositions
    .filter((pos) => pos.stockId === stockId)
    .reduce((sum, pos) => sum + Number(pos.entryPrice) * pos.quantity, 0);

  const totalAmountForStock = existingAmountForStock + requiredAmount;
  const positionPct = (totalAmountForStock / totalBudget) * 100;

  if (positionPct > maxPositionPct) {
    return {
      allowed: false,
      reason: `1銘柄あたりの投資比率上限（${maxPositionPct}%）を超えます（${positionPct.toFixed(1)}%）`,
    };
  }

  // 4. 日次損失制限チェック
  const isLossLimitHit = await checkDailyLossLimit();
  if (isLossLimitHit) {
    return {
      allowed: false,
      reason: "日次損失制限に達しています。本日の新規取引は停止中です",
    };
  }

  return { allowed: true, reason: "OK" };
}

/**
 * 日次損失制限に達しているかチェックする
 */
export async function checkDailyLossLimit(): Promise<boolean> {
  const config = await prisma.tradingConfig.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!config) {
    return true; // 設定がない場合は安全側に倒して取引停止
  }

  const totalBudget = Number(config.totalBudget);
  const maxDailyLossPct = Number(config.maxDailyLossPct);
  const maxDailyLoss = totalBudget * (maxDailyLossPct / 100);

  const todayPnl = await getDailyPnl(new Date());

  return todayPnl < 0 && Math.abs(todayPnl) >= maxDailyLoss;
}

/**
 * 指定日の確定損益を計算する
 */
export async function getDailyPnl(date: Date): Promise<number> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const closedPositions = await prisma.tradingPosition.findMany({
    where: {
      status: "closed",
      exitedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  return closedPositions.reduce((sum, pos) => {
    return sum + (pos.realizedPnl ? Number(pos.realizedPnl) : 0);
  }, 0);
}

/**
 * ポジションサイズを計算する
 *
 * 予算と最大比率の制約内で購入可能な最大株数を算出する。
 * 日本株は単元株制度（100株単位）のため、UNIT_SHARES の倍数に切り捨てる。
 */
export function calculatePositionSize(
  price: number,
  budget: number,
  maxPositionPct: number,
): number {
  if (price <= 0 || budget <= 0 || maxPositionPct <= 0) {
    return 0;
  }

  const maxAmount = budget * (maxPositionPct / 100);
  const maxShares = Math.floor(maxAmount / price);
  return Math.floor(maxShares / UNIT_SHARES) * UNIT_SHARES;
}
