/**
 * 週足レンジブレイクスキャナー（本番用）
 *
 * 週末最終営業日の15:20に実行し、ウォッチリスト銘柄の週足ブレイクシグナルを検出する。
 * - 日足データ → 週足に集約し、当日の時価で今週のバーを補完
 * - isWeeklyBreakSignal() で N週高値ブレイク + 出来高サージを判定
 * - ユニバースフィルター（価格、出来高、ATR%）を通過した銘柄のみトリガー生成
 */

import { isWeeklyBreakSignal } from "./entry-conditions";
import { aggregateDailyToWeekly } from "../../lib/technical-indicators";
import type { WeeklyBar } from "../../lib/technical-indicators";
import { passesUniverseGates } from "../breakout/entry-conditions";
import { WEEKLY_BREAK } from "../../lib/constants/weekly-break";
import { SCREENING } from "../../lib/constants";
import { STOP_LOSS } from "../../lib/constants";
import { getMaxBuyablePrice } from "../risk-manager";
import type { WatchlistEntry } from "../breakout/types";
import type { GapUpQuoteData } from "../gapup/gapup-scanner";

/** 週足ブレイクトリガーイベント */
export interface WeeklyBreakTrigger {
  ticker: string;
  currentPrice: number;
  volumeSurgeRatio: number;
  weeklyHigh: number;
  atr14: number;
  triggeredAt: Date;
  askPrice?: number;
  bidPrice?: number;
  askSize?: number;
  bidSize?: number;
}

/** 日足バー（DB取得用） */
interface DailyBar {
  tickerCode: string;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class WeeklyBreakScanner {
  private watchlistMap: Map<string, WatchlistEntry>;

  constructor(
    watchlist: WatchlistEntry[],
    private tickerWeeklyBars: Map<string, WeeklyBar[]>,
  ) {
    this.watchlistMap = new Map(watchlist.map((e) => [e.ticker, e]));
  }

  /**
   * 週足ブレイクスキャンを実行
   *
   * @param quotes 当日OHLCVデータ（時価で今週のバーを補完するため）
   * @param holdingTickers 保有中のティッカーセット（除外用）
   * @param effectiveCapital 有効資本（maxPrice計算用）
   * @returns WeeklyBreakTrigger[]（breakStrength降順）
   */
  scan(
    quotes: GapUpQuoteData[],
    holdingTickers: Set<string>,
    effectiveCapital: number,
  ): WeeklyBreakTrigger[] {
    const triggers: WeeklyBreakTrigger[] = [];
    const maxPrice = getMaxBuyablePrice(effectiveCapital);

    for (const quote of quotes) {
      const entry = this.watchlistMap.get(quote.ticker);
      if (!entry) continue;
      if (holdingTickers.has(quote.ticker)) continue;

      const weeklyBars = this.tickerWeeklyBars.get(quote.ticker);
      if (!weeklyBars || weeklyBars.length === 0) continue;

      // 今週のバーを当日時価で補完（今週のデータがない場合は新規バー作成）
      const updatedBars = this.appendCurrentWeekBar(weeklyBars, quote);

      // isWeeklyBreakSignal で判定
      const signal = isWeeklyBreakSignal(
        updatedBars,
        WEEKLY_BREAK.ENTRY.HIGH_LOOKBACK_WEEKS,
        WEEKLY_BREAK.ENTRY.VOL_SURGE_RATIO,
      );

      if (!signal.isBreak) continue;

      // ユニバースフィルター
      const atrPct = entry.atr14 > 0 && quote.price > 0
        ? (entry.atr14 / quote.price) * 100
        : 0;
      if (!passesUniverseGates({
        price: quote.price,
        avgVolume25: entry.avgVolume25,
        atrPct,
        maxPrice,
        minAvgVolume25: WEEKLY_BREAK.ENTRY.MIN_AVG_VOLUME_25,
        minAtrPct: WEEKLY_BREAK.ENTRY.MIN_ATR_PCT,
        minTurnover: SCREENING.MIN_TURNOVER,
        minPrice: SCREENING.MIN_PRICE,
      })) continue;

      // SLプレビュー: クランプされる銘柄はスキップ
      const rawSL = quote.price - entry.atr14 * WEEKLY_BREAK.STOP_LOSS.ATR_MULTIPLIER;
      const maxSL = quote.price * (1 - STOP_LOSS.MAX_LOSS_PCT);
      if (rawSL < maxSL) continue;

      triggers.push({
        ticker: quote.ticker,
        currentPrice: quote.price,
        volumeSurgeRatio: signal.weeklyVolSurge,
        weeklyHigh: signal.weeklyHigh,
        atr14: entry.atr14,
        triggeredAt: new Date(),
      });
    }

    // breakStrength（weeklyClose / weeklyHigh の超過率 × 出来高サージ）降順
    triggers.sort((a, b) => {
      const aStrength = (a.currentPrice / a.weeklyHigh - 1) * a.volumeSurgeRatio;
      const bStrength = (b.currentPrice / b.weeklyHigh - 1) * b.volumeSurgeRatio;
      return bStrength - aStrength;
    });

    return triggers;
  }

  /**
   * 今週のバーを当日の時価データで更新/作成する
   */
  private appendCurrentWeekBar(weeklyBars: WeeklyBar[], quote: GapUpQuoteData): WeeklyBar[] {
    const bars = [...weeklyBars];
    const lastBar = bars[bars.length - 1];

    // 最新週足バーが今週のものかどうか判定
    // aggregateDailyToWeekly は ISO 週でグルーピングするため、
    // 最終バーの日付が今週なら更新、そうでなければ新規バー追加
    const now = new Date();
    const lastBarDate = new Date(lastBar.date);
    const isSameWeek = this.getISOWeekKey(lastBarDate) === this.getISOWeekKey(now);

    if (isSameWeek) {
      // 今週のバーを当日時価で更新
      bars[bars.length - 1] = {
        ...lastBar,
        high: Math.max(lastBar.high, quote.high),
        low: Math.min(lastBar.low, quote.low),
        close: quote.price,
        volume: lastBar.volume + quote.volume,
      };
    } else {
      // 新しい週のバーを追加
      bars.push({
        date: now.toISOString().slice(0, 10),
        open: quote.open,
        high: quote.high,
        low: quote.low,
        close: quote.price,
        volume: quote.volume,
      });
    }

    return bars;
  }

  private getISOWeekKey(d: Date): string {
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
    const week1 = new Date(dt.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((dt.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${dt.getFullYear()}-W${weekNum.toString().padStart(2, "0")}`;
  }
}

/**
 * 日足バーをティッカー別にグルーピングする
 */
export function groupDailyBarsByTicker(
  dailyBars: DailyBar[],
): Map<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>> {
  const map = new Map<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>>();
  for (const bar of dailyBars) {
    let arr = map.get(bar.tickerCode);
    if (!arr) {
      arr = [];
      map.set(bar.tickerCode, arr);
    }
    arr.push({
      date: bar.date instanceof Date ? bar.date.toISOString().slice(0, 10) : String(bar.date),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      volume: bar.volume,
    });
  }
  return map;
}

/**
 * 日足バー → 週足バーに変換するヘルパー
 */
export function buildWeeklyBarsFromDaily(
  tickerDaily: Map<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>>,
): Map<string, WeeklyBar[]> {
  const result = new Map<string, WeeklyBar[]>();
  for (const [ticker, bars] of tickerDaily) {
    result.set(ticker, aggregateDailyToWeekly(bars));
  }
  return result;
}
