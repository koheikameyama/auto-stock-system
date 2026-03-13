# スコアリングシステム予測力改善 設計書

## 背景

見送り分析データ（90日間）から、スコアリングシステムのランク付けが勝敗予測に機能していないことが判明。S/A/Bランク間で勝率に有意な差がない（25-28%）。勝ち銘柄と負け銘柄のスコア平均が全カテゴリで同一。

### 根本原因

1. **配点の40%が値動き予測と無関係** — 流動性(25点)+ファンダ(15点)はトレード可否や割高感の評価であり、短期の値動き方向を予測しない
2. **テクニカルがレジーム連動** — 全銘柄を絶対値で評価するため、同日に全銘柄が似たスコアになる
3. **null/中立デフォルトが高すぎる** — シグナルなしで合計19点が付与され、Bランク到達が容易
4. **チャートパターン検出がランク決定の最大要因** — 検出有無で最大14点差だが勝率との相関が未確認
5. **粗い離散ステップ** — RSI 49=7点、RSI 50=10点のような境界ジャンプで微妙な差が失われる
6. **相対比較なし** — セクター内の相対強度が考慮されていない

## 改善方針

既存の4カテゴリ100点満点アーキテクチャを維持しつつ、以下を実施:

- 予測力のある指標（テクニカル）に配点を集中
- 非予測項目（流動性・ファンダ）を足切り寄りに縮小
- 相対強度(RS)を新サブ項目として導入
- null/シグナルなしのデフォルト値を0点に統一
- ステップ関数を区分線形関数に変更

---

## 新しい配点構成（100点満点）

### カテゴリ配分

| カテゴリ | 現行 | 改善後 | 変更理由 |
|---------|------|--------|---------|
| テクニカル | 40点 | **65点** | 予測力のある指標に配点集中 + RS新設 |
| パターン | 20点 | **15点** | チャートパターン検出の有無が支配的すぎた |
| 流動性 | 25点 | **10点** | 方向予測と無関係。足切り的な役割に縮小 |
| ファンダ | 15点 | **10点** | 同上 |

### テクニカル（65点）内訳

| サブ項目 | 現行 | 改善後 | 変更理由 |
|---------|------|--------|---------|
| RSI | 10 | **12** | 粒度改善のため微増 |
| MA（トレンド） | 15 | **18** | トレンドフォローの核。粒度改善分を反映 |
| 出来高×方向性 | 10 | **13** | 銘柄固有の出来高変化率も加味 |
| MACD | 5 | **7** | ヒストグラム加速度の評価を追加 |
| 相対強度(RS) | — | **15** | 新設: セクター内での相対的な強さ |

### パターン（15点）内訳

| サブ項目 | 現行 | 改善後 | 変更理由 |
|---------|------|--------|---------|
| チャートパターン | 14 | **10** | ランク差への過大な影響を縮小 |
| ローソク足 | 6 | **5** | パターン縮小に伴い按分 |

### 流動性（10点）内訳

| サブ項目 | 現行 | 改善後 |
|---------|------|--------|
| 売買代金 | 10 | **5** |
| 値幅率 | 8 | **3** |
| 安定性 | 7 | **2** |

### ファンダメンタルズ（10点）内訳

| サブ項目 | 現行 | 改善後 |
|---------|------|--------|
| PER | 5 | **4** |
| PBR | 4 | **3** |
| 収益性 | 4 | **2** |
| 時価総額 | 2 | **1** |

---

## 新指標: 相対強度（RS）

### 概要

「この銘柄はセクター内で相対的に強いか」を評価する新サブ項目（15点満点）。同日に全銘柄が似たスコアになるレジーム連動問題を解消する。

### 計算方法

既存データを活用し、追加API不要。

**ステップ1: セクター平均リターンの算出**

Stockテーブルの全銘柄から、セクターグループ別に`weekChangeRate`の平均を算出。既に`sector-analyzer.ts`がセクター別集計をしているため、同じ仕組みを流用。

**ステップ2: 個別銘柄のRS値を算出**

```
RS = 銘柄のweekChangeRate - セクター平均weekChangeRate
```

- RS > 0: セクターをアウトパフォーム
- RS < 0: セクターをアンダーパフォーム

**ステップ3: 全候補銘柄のRS値をパーセンタイルに変換**

その日のスコアリング対象銘柄（~90銘柄）のRS値を昇順ソートし、各銘柄のパーセンタイル（0-100）を算出。

**ステップ4: スコア化（線形）**

```
rsScore = Math.round(percentile / 100 * 15)
```

- パーセンタイル100（最強）→ 15点
- パーセンタイル50（中央）→ 8点
- パーセンタイル0（最弱）→ 0点

### 設計根拠

- **相対評価なのでレジーム非依存**: 暴落日でも上位銘柄は高スコア
- **線形変換で粒度が最大**: 90銘柄なら約90段階のスコア差
- **追加データ不要**: 既存のweekChangeRateで計算可能

### データ要件

- `Stock.weekChangeRate`: 既存バッチで毎日更新済み
- `Stock.sector`: セクター分類（既存）
- セクター内に2銘柄未満の場合: RS = 0（パーセンタイル計算不可）

### null/欠損データの扱い

| 条件 | RS値 | rsScore |
|------|------|---------|
| `stockWeekChangeRate` が null | RS = 0 | 0点 |
| `sectorAvgWeekChangeRate` が null | RS = 0 | 0点 |
| `candidateRsValues` が空または未提供 | パーセンタイル計算不可 | 0点 |
| セクター内銘柄数 < 2 | RS = 0 | 0点 |

`scoreTechnicals`をテストやmarket-scanner外から呼ぶ場合、RS関連フィールドが未提供なら0点。関数の純粋性は維持（RS値の事前計算はcaller責務）。

### 定数

```typescript
RELATIVE_STRENGTH: {
  MAX_SCORE: 15,
  MIN_SECTOR_STOCKS: 2,
}
```

---

## 連続スコアリング（ステップ関数→線形補間）

### RSI（12点満点）

ピーク値を持つ区分線形関数に変更。

```
RSI 50-65: 12点（スイートスポット＝トレンド継続ゾーン）
RSI 40-50: 線形 4→12（RSI 40で4点、RSI 50で12点）
RSI 65-75: 線形 12→4（RSI 65で12点、RSI 75で4点）
RSI 30-40: 線形 0→4
RSI <30 or ≥75: 0点
```

現行との比較:

| RSI値 | 現行 | 改善後 |
|-------|------|--------|
| 45 | 7 | 8.0 |
| 49 | 7 | 11.2 |
| 50 | 10 | 12.0 |
| 55 | 10 | 12.0 |
| 63 | 10 | 12.0 |
| 66 | 5 | 11.2 |
| 70 | 5 | 8.0 |

### MA（18点満点）

maAlignmentの離散値に依存するため、完全な連続化は困難。中間ステップを追加して粒度を改善。

```
uptrend + orderAligned + slopesAligned: 18点
uptrend + orderAligned:                 14点
uptrend:                                10点
none (neutral):                          6点
downtrend:                               3点
downtrend + orderAligned:                1点
downtrend + orderAligned + slopesAligned: 0点
```

#### 週足トレンドペナルティ

現行の-7点を、新MA最大値(18点)に比例して **-8点** に調整。

```
日足が uptrend かつ 週足が downtrend → maScore -= 8（最低0）
```

定数: `SCORING.WEEKLY_TREND.PENALTY: 8`

### 出来高×方向性（13点満点）

volumeRatioを連続関数化し、方向性で倍率を掛ける。

```
baseScore = clamp(volumeRatio * 5, 0, 10)

方向性倍率:
  accumulation: ×1.3
  neutral:      ×1.0
  distribution: ×0.5

volumeScore = Math.min(13, Math.round(baseScore * multiplier))
```

スコア例:

| volumeRatio | accumulation | neutral | distribution |
|-------------|-------------|---------|-------------|
| 0.5 | 3 | 3 | 1 |
| 1.0 | 7 | 5 | 3 |
| 1.5 | 10 | 8 | 4 |
| 2.0 | 13 | 10 | 5 |

### MACD（7点満点）

ヒストグラムの加速度を反映した連続スコア。

```
MACDがシグナル上 + ヒストグラム正:
  前回ヒストグラムとの差分で加速度を判定:
    histogram > prevHistogram（加速中）: 7点
    histogram <= prevHistogram（減速中）: 5点

MACDがシグナル上 + ヒストグラム負（縮小中だがまだ上）:
  score = 3

MACDがシグナル下 + ヒストグラム改善中（前回より増加）:
  score = 1（底打ち気配）

デッドクロス（ヒストグラム悪化中）:
  score = 0

null:
  score = 0（現行の2→0に変更）
```

`prevHistogram`は`TechnicalSummary.macd`の既存データから取得不可のため、`historicalData`の直近2日分のMACDヒストグラムを算出して比較する。算出には既存の`calculateMACD()`関数を利用。

### 流動性・ファンダ

配点が小さいため（各10点以下）、現行のステップ関数を維持しつつティア数を調整。

### ローソク足パターン（5点満点）

```
pattern == null（パターンなし）: 0点（現行3→0に変更）
買いシグナル: Math.round(strength / 100 * 5)
売りシグナル: Math.round((100 - strength) / 100 * 5)
中立シグナル: 0点
```

### 出来高の`clamp`関数

```typescript
// clamp(value, min, max) = Math.max(min, Math.min(max, value))
const baseScore = Math.max(0, Math.min(10, volumeRatio * 5));
```

---

## nullデフォルト値の是正

**「シグナルなし = 加点理由なし = 0点」に統一。**

| サブ項目 | 条件 | 現行 | 改善後 |
|---------|------|------|--------|
| RSI | null | 5点 | **0点** |
| MACD | null | 2点 | **0点** |
| Volume | null | 5点 | **0点** |
| ローソク足 | パターンなし | 3点 | **0点** |
| 値幅率 | データなし | 4点 | **0点** |
| 安定性 | データ不足 | 4点 | **0点** |
| PBR | null | 2点 | **0点** |
| EPS | null | 2点 | **0点** |

RSI/MACD/VolumeがnullになるのはhistoricalDataが極端に不足する場合のみ。実運用でnullが多発する銘柄は即死ルールで既に除外されている可能性が高く、影響範囲は限定的。

---

## ランク閾値

**閾値は現行を維持し、バックテストで検証後に調整する。**

| ランク | 閾値 |
|--------|------|
| S | 80点 |
| A | 65点 |
| B | 50点 |
| C | 0-49点 |

新配点でのスコア分布が実データなしには予測困難なため、1-2週間のScoringRecord蓄積後にGhost Trading実績との相関を分析し、必要に応じて調整。

---

## 既存システムへの影響

### 変更が必要なファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/core/technical-scorer.ts` | スコアリング関数の全面改修（配点、連続化、nullデフォルト、RS追加） |
| `src/lib/constants/scoring.ts` | 定数の再定義（配点、RS関連追加） |
| `src/jobs/market-scanner.ts` | RS計算のため2パス処理に変更（後述） |
| `src/core/technical-analysis.ts` | `formatScoreForAI`の最大値表記を更新、RS表示を追加 |
| `src/web/routes/scoring.ts` | `breakdownDetail`でtechnicalBreakdownの`rs`フィールドを表示 |
| `prisma/schema.prisma` | `technicalScore`等のコメントを正しい範囲に修正 |
| `docs/specs/scoring-system.md` | 仕様書を改善内容に合わせて更新 |

### 変更不要なファイル

| ファイル | 理由 |
|---------|------|
| `src/jobs/ghost-review.ts` | スコア値を参照するだけで閾値は定数から読む |
| `src/jobs/scoring-accuracy-report.ts` | 同上 |
| `src/core/contrarian-analyzer.ts` | ボーナス計算ロジックは変更なし |
| `src/core/entry-calculator.ts` | スコアを参照していない |

### Prisma スキーマの変更

マイグレーション不要（カラム型の変更なし）。以下のコメントのみ修正:

```prisma
technicalScore    Int   // 0-65（旧: 0-40）
patternScore      Int   // 0-15（旧: 0-20）
liquidityScore    Int   // 0-10（旧: 0-25）
fundamentalScore  Int   // 0-10（旧: 0-15）
```

`technicalBreakdown` JSONには新しく `rs` フィールドが追加されるが、JSON型のためスキーマ変更不要。

### インターフェース変更

#### `LogicScoreInput`（入力）

```typescript
interface LogicScoreInput {
  // 既存フィールド（変更なし）
  summary: TechnicalSummary;
  chartPatterns: ChartPatternResult[];
  candlestickPattern: PatternResult | null;
  historicalData: OHLCVData[];
  latestPrice: number;
  latestVolume: number;
  weeklyVolatility: number | null;
  weeklyTrend?: WeeklyTrendResult | null;
  fundamentals?: FundamentalInput;
  nextEarningsDate?: Date | null;
  exDividendDate?: Date | null;

  // NEW: RS（事前計算済みスコアを渡す）
  rsScore?: number;  // 0-15, callerが事前計算
}
```

#### `LogicScore`（出力）

```typescript
technical: {
  total: number;        // 0-65 (現行0-40)
  rsi: number;          // 0-12 (現行0-10)
  ma: number;           // 0-18 (現行0-15)
  volume: number;       // 0-13 (現行0-10)
  volumeDirection: VolumeDirection;
  macd: number;         // 0-7  (現行0-5)
  rs: number;           // 0-15 (NEW)
};
```

### market-scannerでの呼び出し変更

RS計算を`scoreTechnicals`の外で行い、算出済みスコアを渡すことで純粋性を維持。

```
改善後のフロー:

Pass 1（既存の並列データ取得は変更なし）:
  ① 全候補の historicalData, technicals 等を並列取得（現行と同じ）

Pass 1.5（RSスコア事前計算 — 新規追加、軽量）:
  ② Stockテーブルから全候補のweekChangeRateを取得
  ③ セクター別平均を算出
  ④ 各銘柄のRS値 = weekChangeRate - sectorAvg
  ⑤ RS値をパーセンタイル変換 → rsScore（0-15）

Pass 2（スコアリング — 現行と同じ構造）:
  ⑥ 各銘柄に rsScore を付与して scoreTechnicals(input) → スコア
```

Pass 1.5はDBクエリ1回 + メモリ内計算のみで、既存の並列バッチ処理構造に影響しない。`scoreTechnicals`は引き続き単一銘柄の純粋関数として動作する。

### `getTechnicalSignal`の閾値

スコア分布が変わるため、この関数の閾値も要調整。ただしランク閾値と同様、デプロイ後にデータを見て調整する方針とし、初期値は現行維持。

### 定数定義（改善後）

```typescript
export const SCORING = {
  CATEGORY_MAX: {
    TECHNICAL: 65,
    PATTERN: 15,
    LIQUIDITY: 10,
    FUNDAMENTAL: 10,
  },

  SUB_MAX: {
    // テクニカル (65点)
    RSI: 12,
    MA: 18,
    VOLUME_CHANGE: 13,
    MACD: 7,
    RELATIVE_STRENGTH: 15,
    // パターン (15点)
    CHART_PATTERN: 10,
    CANDLESTICK: 5,
    // 流動性 (10点)
    TRADING_VALUE: 5,
    SPREAD_PROXY: 3,
    STABILITY: 2,
    // ファンダメンタルズ (10点)
    PER: 4,
    PBR: 3,
    PROFITABILITY: 2,
    MARKET_CAP: 1,
  },

  THRESHOLDS: {
    S_RANK: 80,
    A_RANK: 65,
    B_RANK: 50,
  },

  RELATIVE_STRENGTH: {
    MAX_SCORE: 15,
    MIN_SECTOR_STOCKS: 2,
  },

  // ... 他は既存を調整
} as const;
```
