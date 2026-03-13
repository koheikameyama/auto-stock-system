# バックテスト リターン推移グラフ + 詳細モーダル

## 概要

バックテストページ `/backtest` に以下の2つの改善を実施:

1. **累計リターン%の日次推移グラフ**（Chart.js CDN、13条件重ね描画）
2. **条件詳細をモーダル化**（テーブル最右列に「詳細」ボタン → モーダル表示）

## 背景

現在のバックテストページは基本テーブル＋勝率スパークライン1本のみ。13条件の比較や推移を一目で把握しづらい。

## デザイン

### テーブル変更

最新バックテスト結果テーブルの最右列に「詳細」ボタンを追加:

```
| 条件 | 勝率 | PF | リターン | DD | 取引 | (詳細) |
```

- 「詳細」ボタン押下でモーダルが開く
- 既存の `<details>` 展開セクションは削除

### 詳細モーダル

バックテストページ内に専用コンテナ `<div id="backtest-detail-modal"></div>` を設置（既存の `#stock-modal` とは別管理）。

- オーバーレイクリックまたは Esc で閉じる
- Esc キーハンドラ: `#backtest-detail-modal` が表示中ならそちらを閉じる（既存の stock modal と干渉しない）
- サーバーサイドで各条件のデータを `JSON.stringify()` でページ内にインライン埋め込み（Hono の `html` テンプレート内で安全にエスケープ）
- クライアントJS関数 `openBacktestDetail(conditionKey)` / `closeBacktestDetail()` でモーダルを構築・表示・非表示
- モーダル CSS: 既存の `.modal-overlay` / `.modal-content` クラスを再利用
- 表示内容: 初期資金、価格上限、勝率、勝敗、累計損益、リターン、PF、最大DD、シャープレシオ、平均保有日数、対象銘柄数、期間、実行時間

### リターン推移チャート

Chart.js v4.4 を CDN 経由でバックテストページのみに導入。

| 項目 | 仕様 |
|------|------|
| X軸 | 日付（M/D形式、過去30日） |
| Y軸 | 累計リターン%（totalReturnPct） |
| 線数 | 13本（全パラメータ条件） |
| ベースライン | 太線（3px）、白（#ffffff） |
| 他条件 | 細線（1.5px） |
| 0%ライン | グレーの基準線 |
| 凡例 | 上部に表示、クリックで線の表示/非表示切替。複数行折り返し |
| ツールチップ | ホバーで「条件名: +X.XX%」形式 |
| キャンバスサイズ | 幅: 100%（レスポンシブ）、アスペクト比 2:1（`maintainAspectRatio: true`） |

#### 色分け（4軸 × 3値 + ベースライン = 13色）

| conditionKey | label | 色 |
|---|---|---|
| baseline | ベースライン | #ffffff（太線3px） |
| ts_act_1.5 | TS起動1.5 | #93c5fd |
| ts_act_2.0 | TS起動2.0 | #3b82f6 |
| ts_act_2.5 | TS起動2.5 | #1d4ed8 |
| score_60 | スコア60 | #86efac |
| score_65 | スコア65 | #22c55e |
| score_70 | スコア70 | #15803d |
| atr_0.8 | ATR0.8 | #fdba74 |
| atr_1.0 | ATR1.0 | #f97316 |
| atr_1.5 | ATR1.5 | #c2410c |
| trail_0.8 | トレール0.8 | #d8b4fe |
| trail_1.0 | トレール1.0 | #a855f7 |
| trail_1.5 | トレール1.5 | #7e22ce |

#### データ変換パイプライン

```typescript
// DB の Decimal → number へ変換、日付は dayjs で M/D フォーマット
// 条件ごとにグルーピングして Chart.js datasets 形式に変換

type ChartPoint = { label: string; value: number };
type ChartDataset = { conditionKey: string; conditionLabel: string; points: ChartPoint[] };

// 全条件のトレンドデータを conditionKey でグルーピング
const grouped: Record<string, ChartPoint[]> = {};
for (const d of trendData) {
  const key = d.conditionKey;
  if (!grouped[key]) grouped[key] = [];
  grouped[key].push({
    label: dayjs(d.date).format("M/D"),
    value: Number(d.totalReturnPct),
  });
}
// → JSON.stringify して <script> 内に埋め込み
```

#### エッジケース

- データ0件: 「トレンドデータなし」メッセージ表示（既存パターン踏襲）
- 30日未満のデータ: 存在する日数分だけ表示（部分チャート）
- 一部条件のみデータあり: データがある条件のみ線を描画
- Y軸: Chart.js のオートスケール（極端な値も自動対応）

### データ取得

トレンドデータ取得を全条件に拡張:

```typescript
// 変更前: ベースラインのみ
where: { conditionKey: "baseline" }

// 変更後: 全条件
where: { date: { gte: sinceDate } }
// → 最大 13条件 × 30日 = 390レコード
```

### ページ構成

```
[最新バックテスト結果テーブル + 詳細ボタン列]
[リターン推移チャート]
[バックテスト履歴テーブル]
[詳細モーダル用コンテナ (クリック時のみ表示)]
```

## 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/web/routes/backtest.ts` | テーブルに詳細列追加、`<details>`削除、モーダルHTML/JS追加、Chart.js CDN + canvas + script追加、データ取得を全条件に拡張 |

1ファイルのみの変更で完結。

## 技術的詳細

### Chart.js 導入方式

- CDN: `https://cdn.jsdelivr.net/npm/chart.js@4.4/dist/chart.umd.min.js`（マイナーバージョン固定）
- バックテストページの content 内に `<script src="...">` を配置（layout.ts は変更しない）
- データはサーバーサイドで JSON 変数として `<script>` 内に埋め込み
- CDN読み込み失敗時: チャート領域に「チャートを読み込めませんでした」と表示

### モーダル実装方式

- バックテストページ内に `<div id="backtest-detail-modal"></div>` を配置
- 各条件のデータを `JSON.stringify()` でページ内にインライン埋め込み
- クライアントJS関数 `openBacktestDetail(conditionKey)` でモーダルを構築・表示
- `closeBacktestDetail()` でモーダルを非表示
- Esc キーは `closeBacktestDetail()` を呼び出し（既存の stock modal Esc ハンドラとは独立）
