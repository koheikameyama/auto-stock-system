# ギャップアップ戦略 本番統合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ギャップアップ戦略を本番トレーディングシステムに統合し、breakoutと並行運用可能にする

**Architecture:** 既存のbreakout-monitorに14:50のgapupスキャンを追加。GapUpScannerが立花APIで当日OHLCVを取得し、isGapUpSignal()でシグナル判定。引け条件付き成行注文(sCondition="4")で発注。position-monitorのexit-checkerは既にstrategy override対応済みなので定数追加のみ。ポジション枠はbreakout(3)とgapup(2)で独立管理。

**Tech Stack:** TypeScript, Prisma, 立花証券API, node-cron

---

## File Structure

### 新規作成

| ファイル | 役割 |
|---------|------|
| `src/core/gapup/gapup-scanner.ts` | GapUpScannerクラス（14:50スキャン、シグナル判定、トリガー生成） |
| `src/core/gapup/__tests__/gapup-scanner.test.ts` | GapUpScannerのユニットテスト |

### 変更

| ファイル | 変更内容 |
|---------|---------|
| `src/core/market-regime.ts:200` | TradingStrategy型に`"gapup"`を追加 |
| `src/lib/constants/gapup.ts` | ライブ用定数（GUARD, POSITION_MANAGEMENT）を追加 |
| `src/lib/constants/jobs.ts` | TRAILING_STOP, BREAK_EVEN_STOP, TIME_STOPに`gapup`エントリー追加 |
| `src/lib/constants/trading.ts` | `GAPUP_DEFAULTS`を追加 |
| `src/core/risk-manager.ts:45-80` | `canOpenPosition()`にstrategy別ポジション数チェックを追加 |
| `src/core/breakout/entry-executor.ts` | strategyパラメータ追加、引け成行注文対応 |
| `src/core/broker-orders.ts:109-131` | `BrokerOrderRequest`に`condition`フィールド追加 |
| `src/jobs/breakout-monitor.ts` | 14:50 gapupスキャン統合 |
| `src/core/time-filter.ts` | gapup用の時間帯フィルター追加 |

---

### Task 1: TradingStrategy型にgapupを追加

**Files:**
- Modify: `src/core/market-regime.ts:200`

- [ ] **Step 1: TradingStrategy型を更新**

`src/core/market-regime.ts` の200行目を変更:

```typescript
export type TradingStrategy = "day_trade" | "swing" | "breakout" | "gapup";
```

- [ ] **Step 2: 型チェック実行**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: gapup関連のエラーなし（既存コードに影響しない追加のみ）

- [ ] **Step 3: Commit**

```bash
git add src/core/market-regime.ts
git commit -m "feat: TradingStrategy型にgapupを追加"
```

---

### Task 2: gapup用の定数を追加

**Files:**
- Modify: `src/lib/constants/gapup.ts`
- Modify: `src/lib/constants/jobs.ts`
- Modify: `src/lib/constants/trading.ts`

- [ ] **Step 1: gapup.tsにライブ用定数を追加**

`src/lib/constants/gapup.ts` を以下に変更:

```typescript
/**
 * ギャップアップ戦略の定数
 */
export const GAPUP = {
  ENTRY: {
    GAP_MIN_PCT: 0.03,
    VOL_SURGE_RATIO: 1.5,
    MAX_PRICE: 5000,
    MIN_AVG_VOLUME_25: 100_000,
    MIN_ATR_PCT: 1.5,
  },
  STOP_LOSS: {
    ATR_MULTIPLIER: 1.0,
  },
  /** エントリーガード条件（ライブ用） */
  GUARD: {
    /** gapupスキャン実行時刻（JST、14:50） */
    SCAN_HOUR: 14,
    SCAN_MINUTE: 50,
    /** 1日の最大エントリー件数 */
    MAX_DAILY_ENTRIES: 2,
  },
  /** ポジション管理 */
  POSITION: {
    /** 最大同時保有数（breakoutとは独立） */
    MAX_POSITIONS: 2,
  },
} as const;
```

- [ ] **Step 2: jobs.tsにgapupのトレーリングストップ・BE・タイムストップ定数を追加**

`src/lib/constants/jobs.ts` のBREAK_EVEN_STOP、TRAILING_STOP、TIME_STOPを変更:

```typescript
export const BREAK_EVEN_STOP = {
  ACTIVATION_ATR_MULTIPLIER: {
    day_trade: 0.8,
    swing: 1.5,
    breakout: 1.0,
    gapup: 0.3,    // ATR×0.3の含み益でBE発動（短期戦略のためタイト）
  },
  ACTIVATION_PCT: { day_trade: 0.01, swing: 0.03, breakout: 0.02, gapup: 0.005 },
} as const;

export const TRAILING_STOP = {
  ACTIVATION_ATR_MULTIPLIER: {
    day_trade: 1.2,
    swing: 2.5,
    breakout: 1.5,
    gapup: 0.5,    // ATR×0.5上昇でTS発動（BE=0.3との連携で素早くロック）
  },
  TRAIL_ATR_MULTIPLIER: {
    day_trade: 0.8,
    swing: 1.5,
    breakout: 1.0,
    gapup: 0.3,    // ATR×0.3のタイトなトレール（短期利確優先）
  },
  ACTIVATION_PCT: { day_trade: 0.015, swing: 0.04, breakout: 0.03, gapup: 0.008 },
  TRAIL_PCT: { day_trade: 0.01, swing: 0.04, breakout: 0.02, gapup: 0.005 },
} as const;

export const TIME_STOP = {
  MAX_HOLDING_DAYS: 5,
  MAX_EXTENDED_HOLDING_DAYS: 10,
  /** gapup戦略のタイムストップ */
  GAPUP_MAX_HOLDING_DAYS: 3,
  GAPUP_MAX_EXTENDED_HOLDING_DAYS: 5,
} as const;
```

- [ ] **Step 3: trading.tsにGAPUP_DEFAULTSを追加**

`src/lib/constants/trading.ts` のTRADING_DEFAULTS定義の直後に追加:

```typescript
export const GAPUP_DEFAULTS = {
  MAX_POSITIONS: 2, // gapup戦略の最大同時保有数
} as const;
```

- [ ] **Step 4: 定数がconstants/index.tsからエクスポートされているか確認**

Run: `grep -l "GAPUP\|gapup" src/lib/constants/index.ts`

GAPUPがエクスポートされていなければ `src/lib/constants/index.ts` に追加:

```typescript
export { GAPUP } from "./gapup";
```

`GAPUP_DEFAULTS`も同様にエクスポート。

- [ ] **Step 5: 型チェック実行**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/lib/constants/gapup.ts src/lib/constants/jobs.ts src/lib/constants/trading.ts src/lib/constants/index.ts
git commit -m "feat: gapup戦略のライブ用定数を追加"
```

---

### Task 3: risk-managerにstrategy別ポジション数チェックを追加

**Files:**
- Modify: `src/core/risk-manager.ts:45-80`
- Test: `src/core/__tests__/risk-manager.test.ts`

- [ ] **Step 1: canOpenPositionにstrategyパラメータを追加**

`src/core/risk-manager.ts` の `canOpenPosition` 関数シグネチャを変更:

```typescript
export async function canOpenPosition(
  stockId: string,
  quantity: number,
  price: number,
  prefetch?: RiskCheckPrefetch,
  strategy?: string,
): Promise<{ allowed: boolean; reason: string; retryable?: boolean }> {
```

既存の呼び出し元（entry-executor.ts:124）は5番目の引数を渡さないので後方互換。

- [ ] **Step 2: ポジション数チェックをstrategy別に変更**

`canOpenPosition` 内のポジション数チェック（73-81行付近）を以下に変更:

```typescript
  // 1. オープンポジション数チェック（strategy別）
  if (strategy === "gapup") {
    const gapupPositionCount = openPositions.filter(
      (pos) => pos.strategy === "gapup",
    ).length;
    const gapupMax = GAPUP_DEFAULTS.MAX_POSITIONS;
    if (gapupPositionCount >= gapupMax) {
      return {
        allowed: false,
        reason: `gapup最大同時保有数（${gapupMax}）に達しています（現在: ${gapupPositionCount}）`,
        retryable: true,
      };
    }
  } else {
    // breakout/swing/day_trade は従来通りの全体チェック
    const nonGapupCount = openPositions.filter(
      (pos) => pos.strategy !== "gapup",
    ).length;
    if (nonGapupCount >= maxPositions) {
      return {
        allowed: false,
        reason: `最大同時保有数（${maxPositions}）に達しています（現在: ${nonGapupCount}）`,
        retryable: true,
      };
    }
  }
```

`GAPUP_DEFAULTS`をインポートに追加:

```typescript
import { GAPUP_DEFAULTS } from "../lib/constants";
```

- [ ] **Step 3: 型チェック実行**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add src/core/risk-manager.ts
git commit -m "feat: risk-managerにstrategy別ポジション数チェックを追加"
```

---

### Task 4: broker-ordersに引け成行注文（condition）対応を追加

**Files:**
- Modify: `src/core/broker-orders.ts`

- [ ] **Step 1: BrokerOrderRequestにconditionフィールドを追加**

`src/core/broker-orders.ts` の `BrokerOrderRequest` インターフェースに追加:

```typescript
export interface BrokerOrderRequest {
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  limitPrice: number | null;
  stopTriggerPrice?: number;
  stopOrderPrice?: number;
  expireDay?: string;
  taxType?: string;
  /** 執行条件: "0"=指定なし, "2"=寄付, "4"=引け（デフォルト: "0"） */
  condition?: string;
}
```

- [ ] **Step 2: submitOrderでconditionを利用**

`submitOrder`関数内のparams構築（115行付近）を変更:

```typescript
    sCondition: req.condition ?? TACHIBANA_ORDER.CONDITION.NONE,
```

- [ ] **Step 3: 型チェック実行**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: エラーなし

- [ ] **Step 4: Commit**

```bash
git add src/core/broker-orders.ts
git commit -m "feat: broker-ordersに引け成行注文(condition)対応を追加"
```

---

### Task 5: entry-executorにstrategyパラメータと引け成行対応を追加

**Files:**
- Modify: `src/core/breakout/entry-executor.ts`

- [ ] **Step 1: GapUpTrigger型を定義**

`src/core/gapup/gapup-scanner.ts` はまだ未作成なので、先にentry-executorで使う型を `src/core/breakout/entry-executor.ts` の冒頭に仮定義:

```typescript
/** ギャップアップトリガー（gapup-scanner.tsから渡される） */
export interface GapUpTrigger {
  ticker: string;
  currentPrice: number;
  volume: number;
  volumeSurgeRatio: number;
  atr14: number;
  prevClose: number;
  triggeredAt: Date;
}
```

- [ ] **Step 2: executeEntry関数にstrategyとconditionを追加**

`src/core/breakout/entry-executor.ts` の `executeEntry` 関数シグネチャを変更:

```typescript
export async function executeEntry(
  trigger: BreakoutTrigger | GapUpTrigger,
  brokerMode: string,
  strategy: "breakout" | "gapup" = "breakout",
): Promise<ExecutionResult> {
```

- [ ] **Step 3: SL計算でstrategy別のATR倍率を使用**

SL計算（84行付近）を変更:

```typescript
  import { GAPUP } from "../../lib/constants/gapup";

  const slAtrMultiplier = strategy === "gapup"
    ? GAPUP.STOP_LOSS.ATR_MULTIPLIER
    : BREAKOUT.STOP_LOSS.ATR_MULTIPLIER;
  const rawStopLoss = currentPrice - atr14 * slAtrMultiplier;
```

- [ ] **Step 4: canOpenPositionにstrategyを渡す**

124行付近を変更:

```typescript
  const riskCheck = await canOpenPosition(stock.id, quantity, currentPrice, {
    config: config ?? undefined,
    openPositions,
    effectiveCapital,
  }, strategy);
```

- [ ] **Step 5: TradingOrder作成時にstrategyを動的に設定**

138-163行付近のorder作成を変更:

```typescript
  const isGapUp = strategy === "gapup";
  const orderType = isGapUp ? "market" : "limit";
  const expiresAt = isGapUp
    ? dayjs().tz(TIMEZONE).hour(15).minute(30).second(0).toDate() // 引け成行は当日限り
    : dayjs().tz(TIMEZONE).add(ORDER_EXPIRY.SWING_DAYS, "day").hour(15).minute(0).second(0).toDate();

  const newOrder = await prisma.tradingOrder.create({
    data: {
      stockId: stock.id,
      side: "buy",
      orderType,
      strategy,
      limitPrice: currentPrice,
      takeProfitPrice,
      stopLossPrice,
      quantity,
      status: "pending",
      expiresAt,
      reasoning: isGapUp
        ? `ギャップアップトリガー: 出来高サージ比率 ${trigger.volumeSurgeRatio.toFixed(2)}x, ギャップ3%以上`
        : `ブレイクアウトトリガー: 出来高サージ比率 ${trigger.volumeSurgeRatio.toFixed(2)}x, 20日高値 ¥${'high20' in trigger ? trigger.high20 : ''} 突破`,
      entrySnapshot: {
        trigger: {
          ticker: trigger.ticker,
          currentPrice: trigger.currentPrice,
          volumeSurgeRatio: trigger.volumeSurgeRatio,
          atr14: trigger.atr14,
          triggeredAt: trigger.triggeredAt.toISOString(),
          ...('high20' in trigger ? { high20: trigger.high20 } : {}),
          ...('prevClose' in trigger ? { prevClose: trigger.prevClose } : {}),
        },
        slClamped: isSLClamped,
        riskPct: POSITION_SIZING.RISK_PER_TRADE_PCT,
        strategy,
      },
    },
  });
```

- [ ] **Step 6: ブローカー発注で引け成行注文を使用**

190-197行付近を変更:

```typescript
  if (brokerMode !== "simulation") {
    try {
      const brokerResult = await submitBrokerOrder({
        ticker,
        side: "buy",
        quantity,
        limitPrice: isGapUp ? null : currentPrice, // gapup: 成行、breakout: 指値
        stopTriggerPrice: isGapUp ? undefined : stopLossPrice, // gapup: 引け注文にSL付けない（翌日設定）
        stopOrderPrice: undefined,
        condition: isGapUp ? TACHIBANA_ORDER.CONDITION.CLOSE : undefined, // 引け成行
      });
```

`TACHIBANA_ORDER`をインポート:

```typescript
import { TACHIBANA_ORDER } from "../../lib/constants/broker";
```

- [ ] **Step 7: Slack通知のstrategyを動的に設定**

226-236行付近を変更:

```typescript
  await notifyOrderPlaced({
    tickerCode: ticker,
    name: stock.name,
    side: "buy",
    strategy,
    limitPrice: currentPrice,
    takeProfitPrice,
    stopLossPrice,
    quantity,
    reasoning: isGapUp
      ? `ギャップアップトリガー: 出来高サージ ${trigger.volumeSurgeRatio.toFixed(2)}x`
      : `ブレイクアウトトリガー: 出来高サージ ${trigger.volumeSurgeRatio.toFixed(2)}x / 20日高値 ¥${'high20' in trigger ? trigger.high20 : ''} 突破`,
  });
```

- [ ] **Step 8: 型チェック実行**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: エラーなし

- [ ] **Step 9: Commit**

```bash
git add src/core/breakout/entry-executor.ts
git commit -m "feat: entry-executorにstrategy/引け成行注文対応を追加"
```

---

### Task 6: time-filterにgapup対応を追加

**Files:**
- Modify: `src/core/time-filter.ts`

- [ ] **Step 1: gapup用の時間帯チェックを追加**

`src/core/time-filter.ts` の`checkTimeWindow`関数にgapupケースを追加（57行のday_tradeブロックの前に挿入）:

```typescript
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
```

- [ ] **Step 2: 型チェック実行**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: エラーなし

- [ ] **Step 3: Commit**

```bash
git add src/core/time-filter.ts
git commit -m "feat: time-filterにgapup時間帯フィルターを追加"
```

---

### Task 7: GapUpScannerを作成

**Files:**
- Create: `src/core/gapup/gapup-scanner.ts`
- Create: `src/core/gapup/__tests__/gapup-scanner.test.ts`

- [ ] **Step 1: テストを作成**

`src/core/gapup/__tests__/gapup-scanner.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { GapUpScanner, type GapUpQuoteData } from "../gapup-scanner";
import type { WatchlistEntry } from "../../breakout/types";

function makeWatchlist(overrides?: Partial<WatchlistEntry>): WatchlistEntry[] {
  return [
    {
      ticker: "1234",
      avgVolume25: 200_000,
      high20: 1000,
      atr14: 30,
      latestClose: 980,
      ...overrides,
    },
  ];
}

function makeQuote(overrides?: Partial<GapUpQuoteData>): GapUpQuoteData {
  return {
    ticker: "1234",
    open: 1020,       // 980 × 1.03 = 1009.4 → open > prevClose * 1.03
    price: 1025,       // close >= open (陽線) && close > prevClose * 1.03
    high: 1030,
    low: 1015,
    volume: 400_000,   // 200_000 * 1.5 = 300_000 → 400_000 > 300_000
    ...overrides,
  };
}

describe("GapUpScanner", () => {
  it("ギャップアップ条件を満たす銘柄でトリガーを返す", () => {
    const scanner = new GapUpScanner(makeWatchlist());
    const triggers = scanner.scan([makeQuote()], new Set());
    expect(triggers).toHaveLength(1);
    expect(triggers[0].ticker).toBe("1234");
    expect(triggers[0].currentPrice).toBe(1025);
    expect(triggers[0].volumeSurgeRatio).toBe(2); // 400000 / 200000
  });

  it("陰線（close < open）でトリガーしない", () => {
    const scanner = new GapUpScanner(makeWatchlist());
    const triggers = scanner.scan(
      [makeQuote({ price: 1010, open: 1020 })], // close < open
      new Set(),
    );
    expect(triggers).toHaveLength(0);
  });

  it("ギャップが3%未満でトリガーしない", () => {
    const scanner = new GapUpScanner(makeWatchlist());
    const triggers = scanner.scan(
      [makeQuote({ open: 990 })], // (990-980)/980 = 1% < 3%
      new Set(),
    );
    expect(triggers).toHaveLength(0);
  });

  it("出来高サージ不足でトリガーしない", () => {
    const scanner = new GapUpScanner(makeWatchlist());
    const triggers = scanner.scan(
      [makeQuote({ volume: 250_000 })], // 250000/200000 = 1.25 < 1.5
      new Set(),
    );
    expect(triggers).toHaveLength(0);
  });

  it("保有中銘柄はスキップ", () => {
    const scanner = new GapUpScanner(makeWatchlist());
    const triggers = scanner.scan([makeQuote()], new Set(["1234"]));
    expect(triggers).toHaveLength(0);
  });

  it("volumeSurgeRatio降順でソートされる", () => {
    const watchlist: WatchlistEntry[] = [
      { ticker: "1111", avgVolume25: 200_000, high20: 1000, atr14: 30, latestClose: 980 },
      { ticker: "2222", avgVolume25: 100_000, high20: 1000, atr14: 30, latestClose: 980 },
    ];
    const quotes: GapUpQuoteData[] = [
      { ticker: "1111", open: 1020, price: 1025, high: 1030, low: 1015, volume: 400_000 },
      { ticker: "2222", open: 1020, price: 1025, high: 1030, low: 1015, volume: 400_000 },
    ];
    const scanner = new GapUpScanner(watchlist);
    const triggers = scanner.scan(quotes, new Set());
    expect(triggers).toHaveLength(2);
    // 2222: 400000/100000=4.0, 1111: 400000/200000=2.0
    expect(triggers[0].ticker).toBe("2222");
    expect(triggers[1].ticker).toBe("1111");
  });
});
```

- [ ] **Step 2: テスト実行（失敗確認）**

Run: `npx vitest run src/core/gapup/__tests__/gapup-scanner.test.ts`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: GapUpScanner実装**

`src/core/gapup/gapup-scanner.ts`:

```typescript
/**
 * ギャップアップスキャナー
 *
 * 14:50に1回実行し、ウォッチリスト全銘柄の当日OHLCVからギャップアップシグナルを検出する。
 * isGapUpSignal()（既存の共通モジュール）でシグナル判定。
 */

import { isGapUpSignal } from "./entry-conditions";
import { GAPUP } from "../../lib/constants/gapup";
import type { WatchlistEntry } from "../breakout/types";

/** 立花APIから取得する当日のOHLCVデータ */
export interface GapUpQuoteData {
  ticker: string;
  open: number;
  price: number; // 現在値（14:50時点 ≈ 終値の代替）
  high: number;
  low: number;
  volume: number;
}

/** ギャップアップトリガーイベント */
export interface GapUpTrigger {
  ticker: string;
  currentPrice: number;
  volume: number;
  volumeSurgeRatio: number;
  atr14: number;
  prevClose: number;
  triggeredAt: Date;
}

export class GapUpScanner {
  private watchlistMap: Map<string, WatchlistEntry>;

  constructor(watchlist: WatchlistEntry[]) {
    this.watchlistMap = new Map(watchlist.map((e) => [e.ticker, e]));
  }

  /**
   * ギャップアップスキャンを実行
   *
   * @param quotes 当日OHLCVデータ（立花APIから取得）
   * @param holdingTickers 保有中のティッカーセット（除外用）
   * @returns GapUpTrigger[]（volumeSurgeRatio降順）
   */
  scan(quotes: GapUpQuoteData[], holdingTickers: Set<string>): GapUpTrigger[] {
    const triggers: GapUpTrigger[] = [];

    for (const quote of quotes) {
      const entry = this.watchlistMap.get(quote.ticker);
      if (!entry) continue;

      // 保有中銘柄はスキップ
      if (holdingTickers.has(quote.ticker)) continue;

      // prevClose = ウォッチリストのlatestClose（前日終値）
      const prevClose = entry.latestClose;

      // isGapUpSignal で判定（14:50時点のpriceをcloseとして使用）
      const isSignal = isGapUpSignal({
        open: quote.open,
        close: quote.price,
        prevClose,
        volume: quote.volume,
        avgVolume25: entry.avgVolume25,
        gapMinPct: GAPUP.ENTRY.GAP_MIN_PCT,
        volSurgeRatio: GAPUP.ENTRY.VOL_SURGE_RATIO,
      });

      if (!isSignal) continue;

      const volumeSurgeRatio = entry.avgVolume25 > 0
        ? quote.volume / entry.avgVolume25
        : 0;

      triggers.push({
        ticker: quote.ticker,
        currentPrice: quote.price,
        volume: quote.volume,
        volumeSurgeRatio,
        atr14: entry.atr14,
        prevClose,
        triggeredAt: new Date(),
      });
    }

    // volumeSurgeRatio降順でソート
    triggers.sort((a, b) => b.volumeSurgeRatio - a.volumeSurgeRatio);

    return triggers;
  }
}
```

- [ ] **Step 4: テスト実行（成功確認）**

Run: `npx vitest run src/core/gapup/__tests__/gapup-scanner.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/gapup/gapup-scanner.ts src/core/gapup/__tests__/gapup-scanner.test.ts
git commit -m "feat: GapUpScannerを作成（ライブ用シグナル検出）"
```

---

### Task 8: breakout-monitorに14:50 gapupスキャンを統合

**Files:**
- Modify: `src/jobs/breakout-monitor.ts`

- [ ] **Step 1: gapup関連のインポートを追加**

`src/jobs/breakout-monitor.ts` のインポートに追加:

```typescript
import { GapUpScanner } from "../core/gapup/gapup-scanner";
import type { GapUpQuoteData } from "../core/gapup/gapup-scanner";
import { GAPUP } from "../lib/constants/gapup";
```

- [ ] **Step 2: gapupスキャン済みフラグを追加**

ファイル冒頭のモジュール変数（26-29行付近）に追加:

```typescript
let gapupScanner: GapUpScanner | null = null;
/** 本日のgapupスキャン実行済みフラグ */
let gapupScannedToday = false;
```

日付リセット部分（56-58行付近）に追加:

```typescript
  if (lastScanDate && lastScanDate !== today) {
    scanner = null;
    gapupScanner = null;
    gapupScannedToday = false;
  }
```

gapupScanner初期化:

```typescript
  if (!gapupScanner) {
    gapupScanner = new GapUpScanner(watchlist);
  }
```

- [ ] **Step 3: main関数末尾にgapupスキャンロジックを追加**

`main()` 関数の既存breakoutトリガー処理（174行付近）の後に追加:

```typescript
  // ========================================
  // 8. gapupスキャン（14:50以降、1日1回）
  // ========================================
  const jstNow = dayjs().tz(TIMEZONE);
  const currentMinutes = jstNow.hour() * 60 + jstNow.minute();
  const gapupScanTime = GAPUP.GUARD.SCAN_HOUR * 60 + GAPUP.GUARD.SCAN_MINUTE;

  if (!gapupScannedToday && currentMinutes >= gapupScanTime && gapupScanner) {
    gapupScannedToday = true;
    console.log(`${tag} [gapup] 14:50 gapupスキャン開始`);

    // 当日の始値・高値・安値・現在値・出来高を取得（既に取得済みのquotesを再利用しつつ、OHLCV全項目を取得）
    const gapupQuotesRaw = await tachibanaFetchQuotesBatch(tickers, {
      columns: "pDOP,pDHP,pDLP,pDPP,pDV",
    });

    const gapupQuotes: GapUpQuoteData[] = gapupQuotesRaw
      .filter((q): q is NonNullable<typeof q> => q !== null)
      .map((q) => ({
        ticker: q.tickerCode,
        open: q.open ?? 0,
        price: q.price,
        high: q.high ?? 0,
        low: q.low ?? 0,
        volume: q.volume,
      }));

    if (gapupQuotes.length > 0) {
      const gapupTriggers = gapupScanner.scan(gapupQuotes, holdingTickers);
      console.log(
        `${tag} [gapup] スキャン完了: 時価=${gapupQuotes.length} トリガー=${gapupTriggers.length}`,
      );

      // gapupエントリー件数カウント（当日のgapup注文数）
      const gapupDailyCount = await prisma.tradingOrder.count({
        where: {
          side: "buy",
          strategy: "gapup",
          createdAt: { gte: todayStart },
        },
      });

      // MAX_DAILY_ENTRIES制限
      const remainingSlots = GAPUP.GUARD.MAX_DAILY_ENTRIES - gapupDailyCount;
      const gapupTriggersLimited = gapupTriggers.slice(0, Math.max(0, remainingSlots));

      for (const trigger of gapupTriggersLimited) {
        console.log(
          `${tag} [gapup] トリガー発火: ${trigger.ticker} 価格=¥${trigger.currentPrice} 出来高サージ=${trigger.volumeSurgeRatio.toFixed(2)}x`,
        );
        try {
          const result = await executeEntry(trigger, brokerMode, "gapup");
          if (!result.success) {
            await notifySlack({
              title: `[gapup] エントリー失敗: ${trigger.ticker}`,
              message: `理由: ${result.reason ?? "不明"}\n価格: ¥${trigger.currentPrice.toLocaleString()} / 出来高サージ: ${trigger.volumeSurgeRatio.toFixed(2)}x`,
              color: "warning",
            });
          }
        } catch (err) {
          console.error(`${tag} [gapup] エントリーエラー: ${trigger.ticker}`, err);
          await notifySlack({
            title: `[gapup] エントリー例外: ${trigger.ticker}`,
            message: `${err instanceof Error ? err.message : String(err)}`,
            color: "danger",
          });
        }
      }
    } else {
      console.log(`${tag} [gapup] スキップ: OHLCV取得0件`);
    }
  }
```

- [ ] **Step 4: tachibanaFetchQuotesBatchがOHLCV列をサポートしているか確認**

Run: `grep -n "tachibanaFetchQuotesBatch" src/lib/tachibana-price-client.ts | head -5`

立花APIクライアントがOHLCV（始値・高値・安値）を取得できるか確認。もしcolumnsオプションがない場合は、既存のレスポンスに`open`/`high`/`low`フィールドがあるか確認し、なければクライアント側を修正する必要がある。

※ 実際のAPIコールで始値・高値・安値が返らない場合は、`CLMMfdsGetMarketPrice`の`sTargetColumn`に`pDOP,pDHP,pDLP`を追加して取得する必要がある。この調整はTask 8の実装時にサブエージェントが確認・対応する。

- [ ] **Step 5: resetScanner関数にgapupリセットを追加**

```typescript
export function resetScanner(): void {
  scanner = null;
  gapupScanner = null;
  gapupScannedToday = false;
}
```

- [ ] **Step 6: 型チェック実行**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: エラーなし

- [ ] **Step 7: Commit**

```bash
git add src/jobs/breakout-monitor.ts
git commit -m "feat: breakout-monitorに14:50 gapupスキャンを統合"
```

---

### Task 9: position-monitorのgapup対応（タイムストップoverride）

**Files:**
- Modify: `src/jobs/position-monitor.ts`

- [ ] **Step 1: gapupポジションのタイムストップoverrideを設定**

`src/jobs/position-monitor.ts` の399-417行付近（`checkPositionExit`呼び出し）を変更。

gapupポジションの場合にmaxHoldingDaysOverrideを設定:

```typescript
    // gapup戦略のタイムストップoverride
    let maxHoldingDaysOverride: number | undefined;
    if (position.strategy === "gapup") {
      maxHoldingDaysOverride = TIME_STOP.GAPUP_MAX_EXTENDED_HOLDING_DAYS;
    }

    const exitResult = checkPositionExit(
      {
        entryPrice: entryPriceNum,
        takeProfitPrice: originalTP,
        stopLossPrice: originalSL,
        entryAtr,
        maxHighDuringHold: position.maxHighDuringHold
          ? Number(position.maxHighDuringHold)
          : entryPriceNum,
        currentTrailingStop: position.trailingStopPrice
          ? Number(position.trailingStopPrice)
          : null,
        strategy: position.strategy as TradingStrategy,
        holdingBusinessDays,
        trailMultiplierOverride: trailOverride,
        maxHoldingDaysOverride,
      },
      { open: quote.open, high: quote.high, low: quote.low, close: quote.price },
    );
```

- [ ] **Step 2: gapupポジションの連休前引き締めを追加**

382-389行付近のtrailOverride設定にgapupも含める:

```typescript
    if (position.strategy === "swing" || position.strategy === "breakout" || position.strategy === "gapup") {
      const normalTrail = position.strategy === "gapup"
        ? TRAILING_STOP.TRAIL_ATR_MULTIPLIER.gapup
        : TRAILING_STOP.TRAIL_ATR_MULTIPLIER.swing;
      if (isPreLongHoliday) {
        trailOverride = normalTrail * WEEKEND_RISK.TRAILING_TIGHTEN_MULTIPLIER;
      }
    }
```

- [ ] **Step 3: TIME_STOPのインポートを確認**

`TIME_STOP`が既にインポート済みか確認:

```typescript
import { TIME_STOP } from "../lib/constants";
```

既にインポート済みなら変更不要（`src/lib/constants/index.ts`経由で`jobs.ts`のTIME_STOPがエクスポートされている）。

- [ ] **Step 4: exit-checkerのタイムストップでgapupを適切に処理**

`src/core/exit-checker.ts` の104行を確認:

```typescript
if (exitPrice === null && position.strategy !== "day_trade" && !trailingResult.isActivated) {
```

gapupは`"day_trade"`ではないのでタイムストップが正しく適用される。`maxHoldingDaysOverride`でハードキャップが5日に設定され、`TIME_STOP.MAX_HOLDING_DAYS`（5日）で含み損時の早期カットも機能する。

ただしgapupは3日がベースなので、exit-checkerの109行:

```typescript
const hitBaseLimitWithNoProfit =
  position.holdingBusinessDays >= TIME_STOP.MAX_HOLDING_DAYS && !inProfit;
```

ここの`TIME_STOP.MAX_HOLDING_DAYS`はグローバルな5日。gapupは3日にしたいので、`maxHoldingDaysOverride`をベースリミットにも使う必要がある。

`src/core/exit-checker.ts` の104-114行を修正:

```typescript
  if (exitPrice === null && position.strategy !== "day_trade" && !trailingResult.isActivated) {
    const baseLimit = position.maxHoldingDaysOverride
      ? Math.min(position.maxHoldingDaysOverride, TIME_STOP.MAX_HOLDING_DAYS)
      : TIME_STOP.MAX_HOLDING_DAYS;
    const hardCap = position.maxHoldingDaysOverride ?? TIME_STOP.MAX_EXTENDED_HOLDING_DAYS;
    const inProfit = bar.close > position.entryPrice;
    const hitHardCap = position.holdingBusinessDays >= hardCap;
    const hitBaseLimitWithNoProfit =
      position.holdingBusinessDays >= baseLimit && !inProfit;

    if (hitHardCap || hitBaseLimitWithNoProfit) {
      exitPrice = bar.close;
      exitReason = "time_stop";
    }
  }
```

gapupの場合: `maxHoldingDaysOverride=5` → `baseLimit = min(5, 5) = 5`... これだと3日にならない。

gapup用にbaseLimitのoverrideも別途必要。exit-checkerの`PositionForExit`に`maxBaseLimitOverride`を追加するか、position-monitor側で`maxHoldingDaysOverride`にベース値を、ハードキャップを別パラメータで渡すか。

最もシンプルな方法: position-monitorからgapupの場合にoverrideを2つ渡す。

`PositionForExit`にフィールド追加:

```typescript
export interface PositionForExit {
  // ... 既存フィールド ...
  maxHoldingDaysOverride?: number;       // ハードキャップ（既存）
  baseLimitHoldingDaysOverride?: number; // 含み損時の早期カット日数
}
```

exit-checkerの修正:

```typescript
  if (exitPrice === null && position.strategy !== "day_trade" && !trailingResult.isActivated) {
    const baseLimit = position.baseLimitHoldingDaysOverride ?? TIME_STOP.MAX_HOLDING_DAYS;
    const hardCap = position.maxHoldingDaysOverride ?? TIME_STOP.MAX_EXTENDED_HOLDING_DAYS;
    const inProfit = bar.close > position.entryPrice;
    const hitHardCap = position.holdingBusinessDays >= hardCap;
    const hitBaseLimitWithNoProfit =
      position.holdingBusinessDays >= baseLimit && !inProfit;

    if (hitHardCap || hitBaseLimitWithNoProfit) {
      exitPrice = bar.close;
      exitReason = "time_stop";
    }
  }
```

position-monitorでgapupの場合:

```typescript
    let maxHoldingDaysOverride: number | undefined;
    let baseLimitHoldingDaysOverride: number | undefined;
    if (position.strategy === "gapup") {
      maxHoldingDaysOverride = TIME_STOP.GAPUP_MAX_EXTENDED_HOLDING_DAYS; // 5
      baseLimitHoldingDaysOverride = TIME_STOP.GAPUP_MAX_HOLDING_DAYS;    // 3
    }
```

checkPositionExit呼び出しに`baseLimitHoldingDaysOverride`も渡す。

- [ ] **Step 5: 型チェック実行**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: エラーなし

- [ ] **Step 6: Commit**

```bash
git add src/jobs/position-monitor.ts src/core/exit-checker.ts
git commit -m "feat: position-monitorにgapupタイムストップoverride対応を追加"
```

---

### Task 10: 仕様書・ドキュメント更新

**Files:**
- Modify: `docs/specs/backtest-gapup.md`

- [ ] **Step 1: backtest-gapup.mdに本番統合セクションを追加**

`docs/specs/backtest-gapup.md` の末尾に追加:

```markdown
## 本番統合

### エントリーフロー

1. 8:00: watchlist-builder → breakoutと共通のウォッチリスト
2. 14:50: breakout-monitorの毎分ループ内でGapUpScanner.scan()を1回実行
3. isGapUpSignal()でシグナル判定（14:50時点のcurrentPriceをcloseとして代替）
4. 引け条件付き成行注文（sCondition="4"）で発注
5. 15:00: 引け注文約定 → position-monitorがポジションをopen

### エグジット

breakoutと同じcheckPositionExit()を使用。gapup用overrideで以下を適用:
- BE発動: ATR×0.3
- TS発動: ATR×0.5
- トレール幅: ATR×0.3
- タイムストップ: 3日（延長5日）

### ポジション管理

- breakoutとは独立: gapup max 2ポジション
- セクター・マクロ・日次損失制限はbreakoutと合算
```

- [ ] **Step 2: Commit**

```bash
git add docs/specs/backtest-gapup.md
git commit -m "docs: backtest-gapup.mdに本番統合セクションを追加"
```

---

## Self-Review

**1. Spec coverage:**
- エントリーフロー（14:50スキャン → 引け成行）: Task 7, 8
- GapUpScanner: Task 7
- entry-executor拡張: Task 5
- 定数追加: Task 2
- risk-manager拡張: Task 3
- broker-orders引け成行対応: Task 4
- time-filter: Task 6
- position-monitor exit override: Task 9
- ドキュメント更新: Task 10

**2. Placeholder scan:** なし。全タスクにコード付き。

**3. Type consistency:**
- `GapUpTrigger` → Task 5で定義、Task 7で再定義（scanner.tsの正式版）。entry-executorのは仮定義→Task 7完了後にインポート元を修正する必要あり。
  → **修正**: Task 5のGapUpTrigger仮定義を削除し、Task 7のgapup-scanner.tsからインポートするようにする。Task 5とTask 7の実装順序に注意（Task 7を先に実行するか、Task 5で仮定義→Task 7後に差し替え）。
- `TradingStrategy` に `"gapup"` を追加（Task 1）→ 全ファイルで使用可能。
- `GAPUP_DEFAULTS.MAX_POSITIONS` → Task 2で定義、Task 3で使用。一貫。
- `TIME_STOP.GAPUP_MAX_HOLDING_DAYS` / `GAPUP_MAX_EXTENDED_HOLDING_DAYS` → Task 2で定義、Task 9で使用。一貫。
- `baseLimitHoldingDaysOverride` → Task 9でPositionForExitに追加、exit-checkerで使用。一貫。
