# 週末・連休リスクの考慮（金曜エントリー制限）

Linear: KOH-332

## 背景

スイングポジションを週末/連休に持ち越す場合のギャップリスクが考慮されていない。金曜引け→月曜寄付きのギャップリスクは平日の2-3倍で、3連休ならさらに増大する。現状は曜日に関係なく同じ条件でエントリーしている。

## スコープ

- 金曜日（通常週末前）: 新規エントリーのポジションサイズを50%に縮小
- 3連休以上前: 既存ポジションのトレーリングストップをATR倍率70%に引き締め
- 海外イベント（FOMC、雇用統計等）: 今回はスコープ外（別タスクで対応）

## 設計

### 1. 市場カレンダー拡張

`src/lib/market-calendar.ts` に「次の営業日までの連続非営業日数」を算出する関数を追加する。

```typescript
const MAX_LOOKAHEAD_DAYS = 30; // 無限ループ防止の上限

/**
 * 指定日の翌日から次の営業日までの連続非営業日数を返す
 *
 * 例:
 * - 月〜木（翌日が営業日）: 0
 * - 金曜（土日を挟む）: 2
 * - 金曜 + 月曜祝日（3連休）: 3
 * - GW前: 最大9程度
 * - 年末年始（12/28金→1/4月）: 最大7程度
 *
 * @param date - 判定日（デフォルト: 現在のJST日付）。
 *              バックテストからはシミュレーション日付を渡す:
 *              new Date(dateString + "T00:00:00+09:00")
 * @returns 連続非営業日数
 */
export function countNonTradingDaysAhead(date?: Date): number
```

実装: 翌日から順にループし、`isMarketDay()` が `true` を返すまでカウントする。上限 `MAX_LOOKAHEAD_DAYS` で打ち切り。

### 2. 定数定義

`src/lib/constants/trading.ts` に追加:

```typescript
export const WEEKEND_RISK = {
  // 非営業日がN日以上連続する場合にポジションサイズを縮小
  SIZE_REDUCTION_THRESHOLD: 2,       // 通常の週末（土日）= 2日
  POSITION_SIZE_MULTIPLIER: 0.5,     // ポジションサイズ50%

  // 非営業日がN日以上連続する場合にトレーリングストップを引き締め
  TRAILING_TIGHTEN_THRESHOLD: 3,     // 3連休以上
  TRAILING_TIGHTEN_MULTIPLIER: 0.7,  // ATR倍率を70%に縮小（例: 2.0 → 1.4）
} as const;
```

### 3. エントリー制限（ポジションサイズ50%）

**変更ファイル**: `src/jobs/order-manager.ts`（呼び出し元でbudget調整）

`calculateEntryCondition()` は純粋な計算関数として維持し、カレンダー依存は呼び出し元（`order-manager.ts`）に持たせる。`calculateEntryCondition()` に渡す `cashBalance` を事前に調整する。

```typescript
// order-manager.ts
import { countNonTradingDaysAhead } from "../lib/market-calendar";
import { WEEKEND_RISK } from "../lib/constants";

// フェーズ1の並列分析ループ内、calculateEntryCondition() 呼び出し前:
const nonTradingDays = countNonTradingDaysAhead();
const isWeekendRisk = nonTradingDays >= WEEKEND_RISK.SIZE_REDUCTION_THRESHOLD;
const budgetForSizing = isWeekendRisk
  ? cashBalance * WEEKEND_RISK.POSITION_SIZE_MULTIPLIER
  : cashBalance;

if (isWeekendRisk) {
  console.log(
    `    [${tickerCode}] 週末リスク: ポジションサイズ50%に縮小（非営業日: ${nonTradingDays}日）`,
  );
}

const entryCondition = calculateEntryCondition(
  quote.price,
  techSummary,
  score,
  strategy,
  budgetForSizing,  // ← 調整済みbudget
  maxPositionPct,
  historical,
);
```

**設計判断**: `calculateEntryCondition()` を純粋関数に保つ。カレンダー依存はジョブ層（`order-manager.ts`）が担う。`calculatePositionSize()` の内部ロジック変更は不要。

**適用対象**: スイング・デイトレ両方。デイトレは金曜中に決済されるが、万が一のための安全措置として適用。

### 4. トレーリングストップ引き締め（連休前）

**変更ファイル**: `src/jobs/position-monitor.ts`

オープンポジション監視ループ内で、`countNonTradingDaysAhead()` を呼び出し、非営業日が `TRAILING_TIGHTEN_THRESHOLD` 以上の場合、`checkPositionExit()` に `trailMultiplierOverride` を渡す。

```typescript
// position-monitor.ts
import { countNonTradingDaysAhead } from "../lib/market-calendar";
import { WEEKEND_RISK, TRAILING_STOP } from "../lib/constants";

// オープンポジション監視ループ内（checkPositionExit 呼び出し前）:
const nonTradingDays = countNonTradingDaysAhead();
const isPreLongHoliday = nonTradingDays >= WEEKEND_RISK.TRAILING_TIGHTEN_THRESHOLD;

// スイングポジションのみ引き締め（デイトレは当日決済のため不要）
const trailOverride =
  isPreLongHoliday && position.strategy === "swing"
    ? TRAILING_STOP.TRAIL_ATR_MULTIPLIER.swing * WEEKEND_RISK.TRAILING_TIGHTEN_MULTIPLIER
    : undefined;

const exitResult = checkPositionExit(
  {
    ...existingParams,
    trailMultiplierOverride: trailOverride,
  },
  bar,
);
```

**設計判断**: `PositionForExit` インターフェースの既存プロパティ `trailMultiplierOverride` を活用。出口判定のコアロジック（`exit-checker.ts`, `trailing-stop.ts`）の変更は不要。

**注意**: `activationMultiplierOverride` は変更しない。発動条件は通常通りで、発動後のトレール幅のみ狭める。

### 5. バックテスト対応

**変更ファイル**: `src/backtest/simulation-engine.ts`

バックテストでも同一ロジックを適用し、本番との整合性を保つ。

#### エントリー数量（budget縮小）

```typescript
// simulation-engine.ts のエントリー判定部分（calculateEntryCondition 呼び出し前）:
const simDate = new Date(tradingDays[dayIdx] + "T00:00:00+09:00");
const nonTradingDays = countNonTradingDaysAhead(simDate);
const budgetForSizing = nonTradingDays >= WEEKEND_RISK.SIZE_REDUCTION_THRESHOLD
  ? cash * WEEKEND_RISK.POSITION_SIZE_MULTIPLIER
  : cash;

const entry = calculateEntryCondition(
  latest.close, summary, score as any, config.strategy,
  budgetForSizing,  // ← 調整済み
  maxPositionPct,
  config.gapRiskEnabled ? newestFirst : undefined,
);
```

#### トレーリングストップ引き締め

`config.trailMultiplier`（感度分析用の固定オーバーライド）と週末リスクの引き締めが競合する場合、**感度分析の値を優先**する。感度分析は特定のパラメータを固定して検証する目的なので、週末リスクで上書きしない。

```typescript
// simulation-engine.ts の出口判定部分:
const simDate = new Date(tradingDays[dayIdx] + "T00:00:00+09:00");
const nonTradingDays = countNonTradingDaysAhead(simDate);
const isPreLongHoliday = nonTradingDays >= WEEKEND_RISK.TRAILING_TIGHTEN_THRESHOLD;

// 感度分析の固定値がある場合はそちらを優先
let trailOverride = config.trailMultiplier;
if (trailOverride == null && isPreLongHoliday && config.strategy === "swing") {
  trailOverride = TRAILING_STOP.TRAIL_ATR_MULTIPLIER.swing * WEEKEND_RISK.TRAILING_TIGHTEN_MULTIPLIER;
}

const exitResult = checkPositionExit(
  {
    ...existingParams,
    trailMultiplierOverride: trailOverride,
  },
  bar,
);
```

### 6. ログ出力

**order-manager.ts**: 金曜サイズ縮小が適用される場合（各銘柄ごと）:
```
[6758] 週末リスク: ポジションサイズ50%に縮小（非営業日: 2日）
```

**position-monitor.ts**: 連休前引き締めが適用される場合（ループ先頭で1回のみ）:
```
連休前リスク管理: トレーリングストップ引き締め（ATR倍率 2.0 → 1.4、非営業日: 3日）
```

### 7. ディフェンシブモードとの関係

ディフェンシブモード（bearish/crisis）と連休前リスク管理は独立して動作する。

- **crisis**: ディフェンシブモードが全ポジションを即時決済するため、トレーリングストップ引き締めの効果はない
- **bearish**: ディフェンシブモードが含み益ポジションを決済した後、残存ポジションに対してトレーリングストップ引き締めが適用される

position-monitor.ts の処理順序上、出口判定（section 4の引き締め）→ ディフェンシブモード決済の順で実行される。引き締めたストップで先に決済されるケースもあるが、問題ない。

### 7. テスト

#### market-calendar テスト

- `countNonTradingDaysAhead()`:
  - 月〜木（翌日が営業日）→ 0
  - 金曜（翌日が土曜）→ 2
  - 祝日前日（月曜が祝日の金曜）→ 3
  - GW前（複数祝日が連続）→ 正しい日数
  - 年末（12/28金 → 1/4月の場合）→ 7
  - Date引数での呼び出し（バックテスト用）

#### order-manager テスト

- 平日: `cashBalance` そのまま → 通常サイズ
- 金曜: `cashBalance × 0.5` → サイズ半減
- 既存テストが壊れないこと

#### position-monitor テスト（連休前引き締め）

- 通常日: `trailMultiplierOverride` なし → 通常のトレール幅
- 連休前: `trailMultiplierOverride = 2.0 × 0.7 = 1.4` → 引き締め
- デイトレポジション: 連休前でも引き締めなし

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/market-calendar.ts` | `countNonTradingDaysAhead()` 追加 |
| `src/lib/constants/trading.ts` | `WEEKEND_RISK` 定数追加 |
| `src/jobs/order-manager.ts` | 金曜ポジションサイズ縮小（budget調整） |
| `src/jobs/position-monitor.ts` | 連休前トレーリングストップ引き締め |
| `src/backtest/simulation-engine.ts` | バックテスト対応（budget縮小 + TS引き締め） |
| テストファイル | 各機能のテスト |
