# マイ株 仕様書

## 概要

マイ株はユーザーの銘柄管理画面です。4つのタブ（ポートフォリオ・ウォッチリスト・追跡銘柄・売却済み）で投資銘柄のライフサイクルを管理します。

> **注意**: 売買の推奨は行いません。データに基づく分析結果を表示し、投資判断はユーザー自身が行います。

**ページパス**: `/my-stocks`

## タブ構成

### 1. ポートフォリオ（保有銘柄）

保有中の銘柄一覧。分析データと取引機能を提供します。

**表示条件**: Transactionから計算した保有数量 > 0

**ソート順**:
1. リスクレベルが高い銘柄を優先
2. その他は保有額が大きい順
3. 古いデータ/上場廃止銘柄は薄く表示

**カード表示項目**:
- 銘柄名、証券コード、セクター
- 保有数量、平均取得単価
- 現在価格、含み損益（額・率）
- リスクレベルバッジ（高リスク / 中リスク / 低リスク）
- リスクフラグ（「MA乖離-20%」「連続下落5日」等の事実ラベル）
- 短期分析テキスト（事実ベース）
- 決算日バッジ（30日以内の場合表示）
- 取引履歴（展開可能）

**アクション**:
- 追加購入
- 売却（取引作成）
  - 全株売却時: ウォッチリスト追加 / 追跡追加 / 何もしない（過去の保有へ移動）の選択ダイアログを表示
- 個別設定（売却目標/撤退ライン）
- 削除

### 2. ウォッチリスト（気になる銘柄）

購入検討中の銘柄一覧。分析レポートを提供します。

**ソート順**:
1. テクニカルスコア順（高い順）
2. その他は追加日時が新しい順

**カード表示項目**:
- 銘柄名、証券コード、セクター
- 現在価格
- テクニカルスコア (0-100)、財務健全性ランク (A-E)
- 市場シグナル（bullish / neutral / bearish）
- 注意フラグ（「急騰中」「赤字×高ボラ」等の事実ラベル）
- 価格アラートの目標価格
- **投資スタイル別分析タブ**: 安定配当型 / 成長投資型 / アクティブ型の3つのスタイルで分析結果を切り替え表示。ユーザーの設定スタイルがデフォルト選択される。各スタイルのタブにはスコアと注目ポイントを表示

**アクション**:
- 購入（ポートフォリオに移動 + 取引作成）
- 購入シミュレーション（購入後分析をモーダルで表示。将来的に有料コンテンツとして展開予定）
- 追跡に移動
- 価格アラート設定
- 削除

### 3. 追跡銘柄

AI分析なしで株価だけ追いたい銘柄。上限10銘柄。

**カード表示項目**:
- 銘柄名、証券コード
- 現在価格、前日比
- テクニカルデータ（RSI、出来高比率等の客観データ）
- 決算日バッジ

**アクション**:
- ウォッチリストに移動
- 購入
- 削除

### 4. 売却済み

全量売却した銘柄の履歴。

**表示条件**: Transactionから計算した保有数量 = 0

**カード表示項目**:
- 銘柄名、証券コード
- 総購入額 / 総売却額
- 実現損益（額・率）
- 仮に保有し続けていた場合の比較
- 取引履歴

**アクション**:
- ウォッチリストに追加
- 再購入
- 詳細表示

## 銘柄詳細ページ

**パス**: `/my-stocks/[id]`

マイ株からの銘柄詳細ビュー。取引情報やAI分析を含む詳細表示。

**表示内容**:
- 保有状況（数量、平均取得単価、損益）
- 銘柄分析レポート（ウォッチリストの場合）
- 個別売却目標/撤退ライン
- タブ: チャート / テクニカル分析 / ニュース / 財務詳細
- 取引履歴（編集・削除可能）
- シミュレーション機能（仮購入の損益予測）

## API仕様

### ユーザー銘柄管理

#### `GET /api/user-stocks`

銘柄一覧を取得。

**クエリパラメータ**:
- `mode`: `all` | `portfolio` | `watchlist`

**レスポンス**: `UserStockResponse[]`

#### `POST /api/user-stocks`

銘柄を追加。

**リクエストボディ**:
```json
{
  "tickerCode": "7203.T",
  "type": "portfolio",
  "quantity": 100,
  "price": 2500,
  "date": "2026-02-22",
  "investmentTheme": "中長期安定成長"
}
```

**バリデーション**:
- ポートフォリオ上限: 100銘柄
- ウォッチリスト上限: 100銘柄
- 重複チェック（同一銘柄の二重登録不可）
- 銘柄マスタ未登録の場合: yfinanceで自動検索・登録

#### `PATCH /api/user-stocks/[id]`

銘柄設定を更新（買い時通知価格、売却目標率/撤退ライン率）。

売却目標率・撤退ライン率は正負どちらも入力可能（売却目標のデフォルトは正、撤退ラインのデフォルトは負）。
%入力と金額入力が連動し、どちらからでも設定可能。

**リクエストボディ**:
```json
{
  "targetBuyPrice": 2300,
  "takeProfitRate": 15,
  "stopLossRate": -10
}
```

#### `DELETE /api/user-stocks/[id]`

銘柄を削除。関連するトランザクションも削除。

### 追跡銘柄

#### `GET /api/tracked-stocks`

追跡銘柄一覧を取得。

**レスポンス**:
```json
[
  {
    "id": "xxx",
    "stockId": "xxx",
    "stock": {
      "id": "xxx",
      "tickerCode": "7203.T",
      "name": "トヨタ自動車",
      "sector": "輸送用機器",
      "market": "東証プライム"
    },
    "technicalData": {
      "rsi": 55.3,
      "volumeRatio": 1.8,
      "weekChangeRate": 3.2,
      "chartSignals": ["週間+3.2%の正モメンタム"],
      "fundamentalSignals": ["黒字企業", "売上成長率+15.2%"]
    },
    "currentPrice": null,
    "change": null,
    "changePercent": null,
    "createdAt": "2026-03-01T00:00:00.000Z"
  }
]
```

- `technicalData`: テクニカル・ファンダメンタルの客観データ
  - `rsi`: RSI（相対力指数）
  - `volumeRatio`: 出来高比率（20日平均比）
  - `weekChangeRate`: 週間変化率
  - `chartSignals`: チャート分析のシグナル一覧（事実ベース）
  - `fundamentalSignals`: ファンダメンタル分析のシグナル一覧（事実ベース）

#### `POST /api/tracked-stocks`

追跡銘柄を追加。

**リクエストボディ**: `{ "tickerCode": "7203.T" }` or `{ "stockId": "xxx" }`

**上限**: 10銘柄

#### `DELETE /api/tracked-stocks/[id]`

追跡銘柄を削除。

### 取引管理

#### `PATCH /api/transactions/[id]`

取引情報を編集。

**リクエストボディ**:
```json
{
  "quantity": 200,
  "price": 2600,
  "transactionDate": "2026-02-20"
}
```

**副作用**: なし（保有数量はTransactionから都度計算）。

#### `DELETE /api/transactions/[id]`

取引を削除。最後の取引が削除された場合、PortfolioStock も削除。

### 売却済み銘柄

#### `GET /api/sold-stocks`

売却済み銘柄の一覧を取得。

**レスポンス**:
```json
[
  {
    "id": "xxx",
    "stock": { "tickerCode": "7203.T", "name": "トヨタ自動車" },
    "buyTransactions": [...],
    "sellTransactions": [...],
    "totalBuyAmount": 500000,
    "totalSellAmount": 550000,
    "realizedGain": 50000,
    "realizedGainPercent": 10.0,
    "hypothetical": {
      "currentPrice": 2800,
      "currentValue": 560000,
      "hypotheticalGain": 60000,
      "hypotheticalGainPercent": 12.0
    }
  }
]
```

### CSVインポート（楽天証券）

#### `POST /api/import/rakuten-csv`

楽天証券のCSVデータをインポート。

**リクエストボディ**:
```json
{
  "transactions": [
    {
      "date": "2026-02-15",
      "tickerCode": "7203",
      "type": "buy",
      "quantity": 100,
      "price": 2500
    }
  ]
}
```

**処理フロー**:
1. 証券コード正規化（`.T` サフィックス付与）
2. CSV全体のグローバル日付範囲を計算
3. 対象銘柄の該当日付範囲内の既存取引を削除
4. 新しい取引を挿入
5. PortfolioStock の数量を同期
6. デフォルトの売却目標率/撤退ライン率を適用

### 銘柄追加リクエスト

#### `POST /api/stock-requests`

銘柄マスタへの追加をリクエスト。

**リクエストボディ**:
```json
{
  "tickerCode": "6600.T",
  "name": "キオクシアHD",
  "market": "東証プライム",
  "reason": "IPOしたばかりで気になっている"
}
```

**バリデーション**: yfinanceで銘柄の存在を確認してからリクエストを受理。

#### `GET /api/stock-requests`

自分のリクエスト一覧を取得。

**クエリパラメータ**: `status`, `limit`

## データモデル

### PortfolioStock

| カラム | 型 | 説明 |
|--------|-----|------|
| userId | String | ユーザーID |
| stockId | String | 銘柄ID |
| lastAnalysis | DateTime? | 最終分析日時 |
| shortTerm | Text? | 短期分析テキスト（事実ベース） |
| mediumTerm | Text? | 中期分析テキスト（事実ベース） |
| longTerm | Text? | 長期分析テキスト（事実ベース） |
| marketSignal | String? | bullish / neutral / bearish |
| riskLevel | String? | リスクレベル（high / medium / low） |
| riskFlags | Json? | リスクフラグ配列（事実ベースの注意事項） |
| takeProfitRate | Decimal? | 個別売却目標率（%、取得単価基準、正負可） |
| stopLossRate | Decimal? | 個別撤退ライン率（%、取得単価基準、正負可） |

### WatchlistStock

| カラム | 型 | 説明 |
|--------|-----|------|
| userId | String | ユーザーID |
| stockId | String | 銘柄ID |
| targetBuyPrice | Decimal? | 価格アラートの目標価格 |
| investmentTheme | String? | 投資テーマ |

### Transaction

| カラム | 型 | 説明 |
|--------|-----|------|
| userId | String | ユーザーID |
| stockId | String | 銘柄ID |
| portfolioStockId | String? | ポートフォリオ銘柄ID |
| type | String | buy / sell |
| quantity | Int | 数量 |
| price | Decimal | 単価 |
| totalAmount | Decimal | 合計額 |
| transactionDate | DateTime | 取引日 |

### TrackedStock

| カラム | 型 | 説明 |
|--------|-----|------|
| userId | String | ユーザーID |
| stockId | String | 銘柄ID |

**ユニーク制約**: `(userId, stockId)`

## 関連ファイル

- `app/my-stocks/page.tsx` - ページエントリ
- `app/my-stocks/MyStocksClient.tsx` - メインクライアントコンポーネント
- `app/my-stocks/[id]/page.tsx` - 銘柄詳細ページ
- `app/my-stocks/[id]/MyStockDetailClient.tsx` - 詳細クライアント
- `app/api/user-stocks/route.ts` - ユーザー銘柄管理 API
- `app/api/tracked-stocks/route.ts` - 追跡銘柄 API
- `app/api/transactions/[id]/route.ts` - 取引管理 API
- `app/api/sold-stocks/route.ts` - 売却済み銘柄 API
- `app/api/import/rakuten-csv/route.ts` - CSVインポート API
- `app/api/stock-requests/route.ts` - 銘柄追加リクエスト API
