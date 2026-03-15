# 精度分析ページ設計書

## 概要

見送り分析ページ（`/contrarian`）を**スコアリング精度分析ページ**（`/accuracy`）にリニューアルする。

### コンセプト変更の背景

旧ページは「逆行分析」（市場停止日に上昇した銘柄の追跡）がメインコンセプトだった。しかしシステムは以下のように進化した：

1. ghost-review → scoring-accuracy に刷新（4象限分析 TP/FP/FN/TN）
2. 3カテゴリ+ゲート方式のスコアリングシステム（精度検証が主目的）
3. 期待値ベース戦略への移行（勝率ではなく期待値で評価）

ページの本質は「逆行分析」ではなく「スコアリングシステム全体の判断品質の可視化」であるべき。全ての棄却理由（AI却下・スコア不足・市場停止・即死）を横断的に評価する。

### 逆行ボーナスの扱い

`contrarianBonus` の加点ロジック（`src/core/contrarian-analyzer.ts`）はスコアリングで引き続き使用する。ページからは逆行ボーナス関連の表示を削除する。

---

## ファイル変更

### リネーム・削除

| 変更 | ファイル |
|------|---------|
| リネーム | `src/web/routes/contrarian.ts` → `src/web/routes/accuracy.ts` |

### 修正

| ファイル | 変更内容 |
|---------|---------|
| `src/web/app.ts` | `app.route("/contrarian", ...)` → `app.route("/accuracy", accuracyRoute)` |
| `src/web/views/layout.ts` | ナビ: `path: "/contrarian", label: "見送り"` → `path: "/accuracy", label: "精度"` |

### 変更なし

| ファイル | 理由 |
|---------|------|
| `src/core/contrarian-analyzer.ts` | スコアリング加点ロジックとして引き続き使用 |
| `src/jobs/scoring-accuracy.ts` | `decisionAudit` の保存処理は変更不要 |

---

## データソース

### 主要データ: `TradingDailySummary.decisionAudit`（JSON）

scoring-accuracy ジョブ（平日16:10）が保存する構造:

```typescript
interface DecisionAuditData {
  scoringSummary: {
    totalScored: number;
    aiApproved: number;
    rankBreakdown: Record<string, number>;
  };
  marketHalt: {
    wasHalted: boolean;
    sentiment: string;
    nikkeiChange: number | null;
    totalScored: number;
    risingCount: number;
    risingRate: number | null;
  } | null;
  aiRejection: {
    total: number;
    correctlyRejected: number;
    falselyRejected: number;
    accuracy: number | null;
  };
  scoreThreshold: {
    total: number;
    rising: number;
    avgRisingPct: number | null;
  };
  confusionMatrix: {
    tp: number;
    fp: number;
    fn: number;
    tn: number;
    precision: number | null;
    recall: number | null;
    f1: number | null;
  };
  byRank: Record<string, {
    tp: number;
    fp: number;
    fn: number;
    tn: number;
    precision: number | null;
  }>;
  fpAnalysis: Array<{
    tickerCode: string;
    score: number;
    rank: string;
    profitPct: number;
    misjudgmentType: string;
  }>;
  overallVerdict: string;
}
```

### 補助データ: `ScoringRecord` テーブル

FN/FP銘柄の詳細リスト、傾向分析用のスコア内訳に使用。

---

## ページ構成（5セクション）

### セクション1: 判断整合性サマリー

**データソース**: `TradingDailySummary.decisionAudit`（最新日）

現行の判断整合性セクションをベースに、4象限メトリクスの概要行を上部に追加する。

**レイアウト:**

```
[Precision: 75%] [Recall: 60%] [F1: 66.7%]   ← 新規追加（3カラム）
─────────────────────────────────────────────
[市場停止判断]  [AI却下精度]  [閾値未達で上昇]  ← 既存
─────────────────────────────────────────────
[AIバーディクト]                                ← 既存
```

- Precision/Recall/F1 は `decisionAudit.confusionMatrix` から取得
- Precision >= 60% で緑、< 60% で赤
- F1 >= 50% で緑、< 50% で赤
- データなし時は「scoring-accuracy 実行後に更新されます（16:10 JST 以降）」を表示

### セクション2: 4象限詳細

**データソース**: `decisionAudit.confusionMatrix` + `decisionAudit.byRank`

2つのサブセクションで構成する。

#### 2a. 混同行列（2×2グリッド）

```
              実際に上昇         実際に下落
承認(Go)      TP: 3件 (緑)      FP: 1件 (赤)
棄却           FN: 2件 (黄)      TN: 15件 (灰)
```

- 4セルのカード型レイアウト
- 各セルに件数と色を付ける（TP=緑, FP=赤, FN=黄, TN=灰）

#### 2b. ランク別精度テーブル

`decisionAudit.byRank` を使用。

| ランク | TP | FP | FN | TN | Precision |
|--------|----|----|----|----|-----------|
| S      | 2  | 0  | 1  | 0  | 100%      |
| A      | 1  | 1  | 1  | 3  | 50%       |
| B      | 0  | 0  | 0  | 12 | -         |

### セクション3: FN分析（見逃し銘柄）

**データソース**: `ScoringRecord`（`rejectionReason IS NOT NULL` かつ `ghostProfitPct > 0`）

現行の「見逃し銘柄」セクションを拡張。全ての棄却理由を横断的に表示する。

**現行との差分:**
- 現行: `ai_no_go` と `below_threshold` のみ
- 新規: `market_halted` と `disqualified` も含める

**テーブル列:**

| 日付 | 銘柄 | 棄却理由 | スコア | ランク | 騰落率 |
|------|------|---------|-------|-------|-------|

- 棄却理由をバッジ表示（AI却下=赤、スコア不足=黄、市場停止=橙、即死=赤紫）
- 直近30件を表示（日付降順）
- `ghostAnalysis` がある銘柄にはAI分析アイコンを表示（タップで内容展開）

### セクション4: FP分析（誤エントリー）

**データソース**: `ScoringRecord`（`rejectionReason IS NULL` かつ `ghostProfitPct IS NOT NULL` かつ `ghostProfitPct < 0`）+ `decisionAudit.fpAnalysis`

承認(Go)したが下落した銘柄を表示する。新規セクション。

**テーブル列:**

| 日付 | 銘柄 | スコア | ランク | 騰落率 | 誤判断タイプ |
|------|------|-------|-------|-------|------------|

- `fpAnalysis.misjudgmentType` をバッジ表示
- 直近30件を表示（日付降順）
- `ghostAnalysis` がある銘柄にはAI分析アイコンを表示

### セクション5: 傾向分析

**データソース**: `ScoringRecord`（過去90日、スコア50点以上、`closingPrice IS NOT NULL`）+ `Stock`（セクター情報）

現行の傾向分析セクションから必要なものを残し、不要なものを削除する。

**残すもの:**
- 勝ち vs 負け比較（平均損益、スコア内訳比較テーブル）
- ランク別勝率テーブル
- セクター別成績テーブル

**削除するもの:**
- 逆行実績ランキング（逆行コンセプトを廃止）
- 逆行ボーナス適用銘柄（逆行コンセプトを廃止）
- 低スコア上昇銘柄（FN分析セクションでカバー）
- 翌日継続率（FN分析のスコープに含まれない）
- 低スコア上昇銘柄のセクター分布（FN分析でカバー）
- 低スコア上昇銘柄の日経比較（FN分析でカバー）

**傾向分析の対象データ:**

現行と同様、Bランク以上（50点以上）で購入しなかった全銘柄（`rejectionReason IS NOT NULL`、`closingPrice IS NOT NULL`）を対象とする。

---

## 削除するDBクエリ・ロジック

以下のクエリはページから不要になる：

1. `todayCandidates` — 市場停止日の上昇確認銘柄（逆行コンセプト固有）
2. `recentBonusRecords` — 逆行ボーナス適用銘柄
3. `allHaltedRecords` — 逆行実績ランキング用の `market_halted` 集計
4. `lowScoreWinners` — 低スコア上昇銘柄（FN分析でカバー）
5. `baselineNikkeiAvg` — 低スコア上昇銘柄の日経比較
6. `lowScoreSectorStats` — 低スコア上昇銘柄のセクター分布
7. ranking 集計ロジック（`buckets` → `ranking`）

## 追加するDBクエリ

1. **FP銘柄**: `ScoringRecord` where `rejectionReason IS NULL` かつ `ghostProfitPct < 0` かつ `closingPrice IS NOT NULL`（直近30件）

---

## 不要になるimport

- `calculateContrarianBonus` — 逆行ボーナス計算（ページで不使用に）
- `CONTRARIAN` 定数 — `SCORING_ACCURACY.LOOKBACK_DAYS` 等で代替

ただし `CONTRARIAN.LOOKBACK_DAYS`（90日）は傾向分析で引き続き使うため、ルックバック日数の参照先を適切に選択する（`CONTRARIAN` または `SCORING_ACCURACY` の定数を使用）。
