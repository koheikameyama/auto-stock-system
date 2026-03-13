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
| ローソク足 | 6 | **5** | 微減 |

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
  score = 5 + min(2, histogram / avgHistogram)  // 5-7点
  → ヒストグラムが平均以上に拡大中なら7点（加速）

MACDがシグナル上 + ヒストグラム縮小:
  score = 3

MACDがシグナル下 + ヒストグラム改善中:
  score = 1（底打ち気配）

デッドクロス:
  score = 0

null:
  score = 0（現行の2→0に変更）
```

### 流動性・ファンダ

配点が小さいため（各10点以下）、現行のステップ関数を維持しつつティア数を調整。

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
| `src/jobs/market-scanner.ts` | RS計算のためセクター平均を事前算出し`scoreTechnicals`に渡す |
| `docs/specs/scoring-system.md` | 仕様書を改善内容に合わせて更新 |

### 変更不要なファイル

| ファイル | 理由 |
|---------|------|
| `prisma/schema.prisma` | ScoringRecordの構造は変わらない |
| `src/jobs/ghost-review.ts` | スコア値を参照するだけで閾値は定数から読む |
| `src/jobs/scoring-accuracy-report.ts` | 同上 |
| `src/core/contrarian-analyzer.ts` | ボーナス計算ロジックは変更なし |
| `src/core/entry-calculator.ts` | スコアを参照していない |
| `src/web/routes/scoring.ts` | DBから読むだけ |

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

  // NEW: RS計算用
  sectorAvgWeekChangeRate?: number | null;
  stockWeekChangeRate?: number | null;
  candidateRsValues?: number[];
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

```
現行:
  各銘柄を独立にscoreTechnicals(input) → スコア

改善後:
  ① 全候補のweekChangeRateとセクター平均を事前計算
  ② 全候補のRS値（stock - sectorAvg）を配列化
  ③ 各銘柄にRS関連データを付与してscoreTechnicals(input) → スコア
```

2パス処理になるが、1パス目はweekChangeRateの集計のみで軽量。

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
