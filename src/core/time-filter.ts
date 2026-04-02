/**
 * エントリー時間帯フィルタ
 *
 * 時間帯に応じたエントリー可否判定を行う。
 * - breakout: 9:00-9:30の寄付き直後はブロック（乱高下回避）
 * - gapup: 14:50-15:00のみエントリー可能
 */

import { TIME_WINDOW, TIMEZONE } from "../lib/constants";
import type { TradingStrategy } from "./market-regime";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface TimeWindowCheck {
  canTrade: boolean;
  reason: string;
  isOpeningVolatility: boolean;
}

/**
 * 現在時刻に基づいてエントリー可否を判定する
 *
 * @param strategy - トレード戦略（breakout / gapup）
 * @param now - 判定時刻（デフォルト: 現在のJST）
 */
export function checkTimeWindow(
  strategy: TradingStrategy,
  now?: dayjs.Dayjs,
): TimeWindowCheck {
  const jstNow = now ?? dayjs().tz(TIMEZONE);
  const hour = jstNow.hour();
  const minute = jstNow.minute();
  const timeMinutes = hour * 60 + minute;

  // 寄付き直後チェック（9:00-9:30）
  const openStart =
    TIME_WINDOW.OPENING_VOLATILITY.start.hour * 60 +
    TIME_WINDOW.OPENING_VOLATILITY.start.minute;
  const openEnd =
    TIME_WINDOW.OPENING_VOLATILITY.end.hour * 60 +
    TIME_WINDOW.OPENING_VOLATILITY.end.minute;
  const isOpeningVolatility = timeMinutes >= openStart && timeMinutes < openEnd;

  // breakout: 寄付き30分は新規エントリー不可（乱高下回避）
  if (strategy === "breakout" && isOpeningVolatility) {
    return {
      canTrade: false,
      reason: "寄付き30分の乱高下回避（09:30以降にエントリー）",
      isOpeningVolatility: true,
    };
  }

  // gapup: 14:50-15:00のみエントリー可能
  if (strategy === "gapup") {
    const gapupStart = 14 * 60 + 50; // 14:50
    const gapupEnd = 15 * 60;        // 15:00
    if (timeMinutes < gapupStart || timeMinutes >= gapupEnd) {
      return {
        canTrade: false,
        reason: "gapup戦略は14:50-15:00のみエントリー可能",
        isOpeningVolatility: false,
      };
    }
    return {
      canTrade: true,
      reason: "OK",
      isOpeningVolatility: false,
    };
  }

  return {
    canTrade: true,
    reason: isOpeningVolatility
      ? "寄付き直後（板が薄い時間帯）"
      : "OK",
    isOpeningVolatility,
  };
}
