# 銘柄スクリーニング 仕様書

## 概要

プリセット条件に基づいて銘柄をフィルタリングする機能です。初心者でも迷わず使えるシンプルな設計で、カスタム条件は設けずプリセットのみを提供します。

> **注意**: スクリーニング結果は条件に合致した銘柄のデータ表示であり、売買の推奨は含みません。

**ページパス**: `/screening`

## プリセット条件

| プリセット名 | 説明 | 主な条件 |
|-------------|------|----------|
| 高配当 | 配当利回りが高い銘柄 | 配当利回り ≥ 3%、黒字、PER ≤ 20 |
| 割安 | PER/PBRが低い銘柄 | PER ≤ 15、PBR ≤ 1.0、黒字 |
| 成長株 | 売上・利益成長率が高い銘柄 | 売上成長率 ≥ 10%、黒字、ROE ≥ 10% |
| 安定大型 | 時価総額が大きく安定した銘柄 | 時価総額 ≥ 1兆円、黒字、ボラティリティ ≤ 30% |
| テクニカル好転 | テクニカル指標が改善傾向の銘柄 | RSI 30-50（売られすぎからの回復）、出来高比率 ≥ 1.5 |
| 出来高急増 | 出来高が急増している銘柄 | 出来高比率 ≥ 2.0、黒字 |

## 画面構成

### プリセット選択

- 横スクロールのチップ（タブ）でプリセットを選択
- ユーザーの投資スタイルに応じたデフォルト選択:
  - 安定配当型 → 「高配当」
  - 成長投資型 → 「成長株」
  - アクティブ型 → 「テクニカル好転」

### 結果一覧

- 条件に合致した銘柄をスコア順に表示（最大50件）
- 各銘柄カード:
  - 銘柄名、証券コード、セクター
  - 現在価格
  - プリセット条件に関連する主要指標（例: 配当利回り、PER、売上成長率）
  - 保有状態バッジ（保有中 / ウォッチ中 / 追跡中）
- 予算フィルタ: 投資予算設定済みの場合、1単元購入可能な銘柄のみ表示（トグルで切替可能）

### アクション

- 銘柄タップ → 銘柄詳細ページへ遷移
- ウォッチリスト追加
- 追跡銘柄追加

## API仕様

### `GET /api/screening`

プリセット条件でスクリーニング結果を取得。

**クエリパラメータ**:
- `preset`: プリセット名（high_dividend / undervalued / growth / stable_large / technical_recovery / volume_spike）
- `budgetFilter`: boolean（予算フィルタ適用有無、デフォルト false）

**レスポンス**:
```json
{
  "stocks": [
    {
      "stockId": "xxx",
      "tickerCode": "8306.T",
      "name": "三菱UFJ",
      "sector": "銀行業",
      "latestPrice": 1850,
      "highlights": {
        "dividendYield": 3.5,
        "per": 12.3,
        "roe": 8.5
      },
      "isOwned": false,
      "isWatched": true,
      "isTracked": false
    }
  ],
  "preset": "high_dividend",
  "presetName": "高配当",
  "totalCount": 42,
  "date": "2026-02-27"
}
```

### `GET /api/screening/presets`

利用可能なプリセット一覧を取得。

**レスポンス**:
```json
{
  "presets": [
    {
      "id": "high_dividend",
      "name": "高配当",
      "description": "配当利回りが高い銘柄",
      "conditions": {
        "dividendYield": { "gte": 3.0 },
        "isProfitable": true,
        "per": { "lte": 20 }
      },
      "highlightFields": ["dividendYield", "per", "roe"],
      "recommendedFor": ["CONSERVATIVE"]
    }
  ]
}
```

## データモデル

### ScreeningPreset

| カラム | 型 | 説明 |
|--------|-----|------|
| id | String | PK（プリセット識別子: high_dividend等） |
| name | String | 表示名（「高配当」等） |
| description | String | 説明文 |
| conditions | Json | フィルタ条件 |
| highlightFields | Json | 結果に表示する主要指標フィールド名 |
| recommendedFor | Json | 推奨投資スタイル配列 |
| sortBy | String | ソートキー |
| sortOrder | String | asc / desc |
| isActive | Boolean | 有効フラグ |
| createdAt | DateTime | 作成日時 |

## 関連ファイル

- `app/screening/page.tsx` - スクリーニングページ
- `app/screening/ScreeningClient.tsx` - クライアントコンポーネント
- `app/api/screening/route.ts` - スクリーニング API
- `app/api/screening/presets/route.ts` - プリセット一覧 API
- `lib/screening-filter.ts` - スクリーニングフィルタロジック
