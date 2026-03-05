# ダッシュボード仕様書

## 概要

ダッシュボードはユーザーがログイン後に最初に表示されるメインページです。ポートフォリオの状況、市場データ、注目データ、セクタートレンドを一覧で確認できます。

> **注意**: 売買の推奨は行いません。市場データと分析結果を整理して表示し、投資判断はユーザー自身が行います。

**ページパス**: `/dashboard`

## 画面構成

### 1. 市場環境サマリー（最上部）

ページタイトルの直下に表示される統合カード型コンポーネント。朝と夜の2セッションで異なる視点の市場データを整理して表示する。

**前提条件**: ポートフォリオ + ウォッチリスト合計3銘柄以上（未満の場合は案内メッセージを表示）

**セッション切り替え**: カード上部にタブ（朝の市場環境 / 今日の振り返り）を表示。JST 15時以降は夜セッションがデフォルト。

| 項目 | 説明 |
|------|------|
| セッションタブ | 🧭 朝の市場環境 / 🌙 今日の振り返り の切り替え |
| 市場トーンバッジ | bullish / bearish / neutral / sector_rotation（色分けあり） |
| マーケットヘッドライン | 朝: 今日の市場環境 / 夜: 今日の市場結果総括 |
| 市場主要因 | 市場を動かしている主要因（1〜2文、事実ベース） |
| ポートフォリオ状態バッジ | healthy / caution / warning / critical（色分けあり） |
| ポートフォリオ総評 | 朝: 持ち株関連データの変化点 / 夜: 持ち株の状態サマリー |
| 要点 | 朝: 今日の市場環境の要点 / 夜: 今日の振り返りの要点（事実ベース、行動指示なし） |
| バディメッセージ | 朝: 前向きな激励 / 夜: 労いと明日への期待 |
| 詳細（折りたたみ） | 銘柄ハイライト・セクターハイライト |

**API**: `GET /api/portfolio/overall-analysis?session=morning|evening`

詳細仕様は [portfolio-analysis.md](portfolio-analysis.md) を参照。

#### 市場警戒アラート

市場の急変を検知した場合、市場環境サマリー内にアラートバナーを表示する。売買の凍結や強制介入は行わず、事実の表示のみ。

| 項目 | 説明 |
|------|------|
| 表示条件 | 市場警戒条件に該当（VIX急騰、日経急落等） |
| トリガー種別 | 日経225急落 / VIX急騰 / WTI原油急変動 / 為替急変動 |
| トリガー値 | VIX絶対値またはパーセント変動率を表示 |
| UI | 赤色ボーダーの警告カード（`MarketAlertBanner` コンポーネント） |

**API**: `GET /api/market/alerts`

#### イブニングレビュー（eveningセッション追加機能）

夜セッション（今日の振り返り）に追加される機能。今日の取引データと市場の変化を客観的に整理し、事実ベースで振り返る。

**表示条件**: eveningセッション選択時に、市場環境サマリーの詳細（折りたたみ）内に表示

##### a. 取引の振り返り

今日実行した取引について、取引時点のテクニカルデータを整理して表示する。

| 項目 | 説明 |
|------|------|
| 対象銘柄 | 今日売買を実行した銘柄 |
| 取引時のデータ | 取引価格、出来高、RSI、MACD等のテクニカル指標 |
| 市場環境 | 取引時の市場全体の状況（日経225、セクタートレンド） |

※ 取引の良し悪しの評価や改善アドバイスは行わない。データの整理のみ。

##### b. ウォッチリスト銘柄の変動

ウォッチリスト銘柄のうち、大きな値動きがあった銘柄を表示する。

| 項目 | 説明 |
|------|------|
| 急騰銘柄 | ウォッチリスト内で当日+3%以上上昇した銘柄 |
| 急落銘柄 | ウォッチリスト内で当日-3%以上下落した銘柄 |
| 変動要因 | ニュースや出来高等の客観データ |

※ 「買い逃した」等の機会損失の指摘は行わない。

##### c. 改善分析

過去の売買履歴から、テクニカルデータに基づくパターンを分析する。

| 項目 | 説明 |
|------|------|
| 取引パターン | 過去の取引タイミングとテクニカル指標の傾向 |
| データ分析 | 「利確時の平均RSI: 72」「損切り時の平均保有期間: 45日」等の統計データ |
| 参考情報 | 関連するテクニカル指標の解説 |

※ 「利確が早すぎる」等の行動評価や改善提案は行わない。データの分析結果のみ。

##### データモデル

`PortfolioOverallAnalysis` モデルに `eveningReview Json?` カラムとして保存。

```json
{
  "tradeReview": [
    {
      "tickerCode": "8306.T",
      "name": "三菱UFJ",
      "action": "buy",
      "priceAtTrade": 1850,
      "rsiAtTrade": 55.3,
      "macdAtTrade": 12.5,
      "marketContext": "日経225は+0.8%、銀行セクターは上昇トレンド"
    }
  ],
  "watchlistMovers": [
    {
      "tickerCode": "6758.T",
      "name": "ソニーグループ",
      "changeRate": 4.2,
      "volumeRatio": 2.1,
      "factor": "好決算発表により出来高が20日平均の2.1倍に増加"
    }
  ],
  "tradingPatterns": [
    {
      "pattern": "profit_taking_rsi",
      "description": "過去1ヶ月の利確時の平均RSI: 72",
      "dataPoints": ["2/15: RSI 75で利確", "2/20: RSI 68で利確"],
      "referenceInfo": "RSI（相対力指数）: 70以上は買われすぎゾーンとされる指標"
    }
  ]
}

### 2. 海外市場データ（morningセッションのみ表示）

海外市場の夜間データを表示するカード。予測ラベルは表示せず、事実データのみ。

**表示条件**: JST 07:00〜15:00 のみ表示

| 項目 | 説明 |
|------|------|
| CME日経先物 | 終値と前日比変化率 |
| USD/JPY | 終値と前日比変化率 |
| S&P 500 | 終値と前日比変化率 |
| NASDAQ | 終値と前日比変化率 |
| 変動幅バッジ | 大幅変動 / やや変動 / 小幅（海外市場の変動幅に基づく事実表示） |

※ ギャップアップ/ダウンの「予測」ラベルは表示しない。海外市場データの事実表示のみ。

**API**: `GET /api/market/pre-market-data`

**データソース**: `PreMarketData` テーブル（毎朝07:00 JST に `pre-market-data.yml` で取得）

### 3. 日経225指数

| 項目 | 説明 |
|------|------|
| 現在値 | 日経225のリアルタイム価格 |
| 変動額 | 前日比の変動額（円） |
| 変動率 | 前日比の変動率（%） |

**API**: `GET /api/market/nikkei`

#### 日経平均チャート（折りたたみ式）

カードをタップするとチャートが展開される。

| 項目 | 説明 |
|------|------|
| 期間切替 | 1ヶ月 / 3ヶ月 / 1年 |
| 日経平均ライン | オレンジ色の折れ線（期間初日を0%として騰落率表示） |
| ポートフォリオライン | 青色の折れ線（同じく騰落率表示、保有株がある場合のみ） |
| アウトパフォーマンス | チャート下部に市場に対する差分を表示 |

**API**:
- `GET /api/market/nikkei/historical?period={1m|3m|1y}`
- `GET /api/portfolio/history?period={1m|3m|1y}`

### 4. ポートフォリオサマリー（保有銘柄がある場合のみ表示）

| 項目 | 説明 |
|------|------|
| 総資産額 | 保有銘柄の時価総額合計 |
| 含み損益 | 総資産額 - 総投資額 |
| 損益率 | 含み損益 / 総投資額 × 100 |
| 市場比較 | 日経225との比較パフォーマンス |

- 保有銘柄リスト（展開可能）: 銘柄名、数量、現在価格、個別損益

**API**: `GET /api/portfolio/summary`

### 5. 予算サマリー

| 項目 | 説明 |
|------|------|
| 投資予算 | ユーザー設定の投資予算総額 |
| 投資済み | 現在の保有銘柄の取得原価合計 |
| 残り予算 | 投資予算 - 投資済み |

**API**: `GET /api/budget/summary`

### 6. 資産推移チャート（保有銘柄がある場合のみ表示）

- 期間選択: 1ヶ月 / 3ヶ月 / 6ヶ月 / 1年
- 表示モード切替: 資産推移 / 損益推移
- 折れ線グラフ（Recharts）

**API**: `GET /api/portfolio/history?period={1m|3m|6m|1y}`

**レスポンス**:
```json
[
  {
    "date": "2026-02-01",
    "totalValue": 1500000,
    "totalCost": 1200000,
    "unrealizedGain": 300000,
    "unrealizedGainPercent": 25.0,
    "stockCount": 5
  }
]
```

### 7. ポートフォリオ構成チャート（保有銘柄がある場合のみ表示）

- 銘柄別構成（円グラフ）
- セクター別構成（円グラフ）

**API**: `GET /api/portfolio/composition`

### 8. 地政学・マクロリスク（セクタートレンドの直上）

直近3日の地政学・マクロ経済ニュースをコンパクトカードで表示。事実の表示のみで、防御措置や売買介入は行わない。

| 項目 | 説明 |
|------|------|
| リスクレベルバッジ | 安定（緑）/ 注意（黄）/ 警戒（赤） |
| リスクデータ | リスクスコア、要因一覧 |
| ニュース一覧 | 最大3件。タイトル + 影響セクター + 影響方向 |
| 詳細リンク | ニュースページ（市場影響フィルター）へ遷移 |

**リスクレベル判定（サーバーサイド算出）**:

VIX・WTI・地政学ニュースからリスクスコアを算出:
- VIXレベル: VIX>=30→40点, VIX>=25→20点, VIX>=20→10点
- VIX急変動: 前日比>=20%→20点
- WTI急変動: |前日比|>=5%→15点
- 地政学ネガティブニュース: 1件5点（最大3件=15点）

| スコア | レベル | 表示 |
|--------|--------|------|
| <25 | stable（安定）| 緑色バッジ |
| 25-49 | caution（注意）| 黄色バッジ |
| >=50 | alert（警戒）| 赤色バッジ + 要因を強調表示 |

※ リスクレベルに応じた売買介入（損切りライン引き締め、buy→stay強制等）は行わない。事実の表示のみ。

**API**: `GET /api/news/geopolitical`
- レスポンス: `{ news, riskLevel, riskScore, riskFactors }`

### 9. セクタートレンドヒートマップ

- 全セクターのトレンドスコアを色分けグリッド表示
- 時間窓切替: 3日 / 7日
- 表示項目: トレンドスコア、ニュース件数、平均週間変化率

**API**: `GET /api/sector-trends`

### 10. 今日の注目データ（パーソナライズ）

- ユーザーごとに客観的条件でピックアップした最大5銘柄を横スクロールカードで表示
- 各カード表示項目:
  - 銘柄名、証券コード
  - 現在価格
  - 注目理由の種類バッジ（出来高急増 / テクニカル変化 / 大幅な値動き / MA乖離拡大 / 決算直前 / セクタートレンド）
  - 注目理由テキスト（事実ベース）
  - 保有状態バッジ（保有中 / ウォッチ中 / 追跡中）
- 古いデータの場合は警告表示
- 「再生成」ボタンで手動再生成可能

※ 売買の推奨は含まない。データ変化の事実を表示するのみ。

**API**: `GET /api/highlights`

詳細仕様は [daily-highlights.md](daily-highlights.md) を参照。

**レスポンス**:
```json
{
  "highlights": [
    {
      "id": "xxx",
      "stockId": "xxx",
      "position": 1,
      "highlightType": "volume_spike",
      "highlightReason": "出来高が20日平均の3.2倍に急増",
      "stock": {
        "tickerCode": "8306.T",
        "name": "三菱UFJ",
        "sector": "銀行業",
        "latestPrice": 1850,
        "isProfitable": true,
        "volatility": 25.3,
        "weekChangeRate": 2.5
      }
    }
  ],
  "date": "2026-02-22",
  "session": "morning",
  "isToday": true
}
```

### 11. スクリーニング結果（プリセット条件別）

- プリセット条件（高配当 / 割安 / 成長株等）に基づいたスクリーニング結果を横スクロールカードで表示
- 各プリセット条件ごとに上位5銘柄を表示
- 投資スタイルに応じてデフォルト表示するプリセットを変更
- 各カード表示項目:
  - 銘柄名、証券コード、セクター
  - 現在価格（リアルタイム取得）
  - スクリーニング条件に関連する主要指標（例: 配当利回り、PER、売上成長率）
  - 市場シグナルバッジ（bullish / neutral / bearish）
  - 保有状態バッジ（保有中 / ウォッチ中 / 追跡中）

※ 売買の推奨は含まない。条件に合致した銘柄をデータとして一覧表示するのみ。

**前提条件**: 投資スタイルが設定済みであること（未設定の場合はデフォルトプリセットを表示）

**API**: `GET /api/screening?preset=high_dividend`

詳細仕様は [screening.md](screening.md) を参照。

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
      "marketSignal": "bullish",
      "isOwned": false,
      "isWatched": true,
      "isTracked": false
    }
  ],
  "preset": "high_dividend",
  "presetName": "高配当",
  "date": "2026-02-27"
}
```

### 12. 市場ランキング（上昇/下落）

- 上昇TOP5、下落TOP5を表示
- 各銘柄の変化率とAI原因分析

**API**: `GET /api/market-analysis/gainers-losers`

## データフロー

```
ユーザーがダッシュボードにアクセス
    ↓
page.tsx（Server Component）
├─ 認証確認
├─ 利用規約同意確認
├─ ユーザー設定・保有銘柄取得
└─ コンポーネント描画
    ↓
各Client Component（並列レンダリング）
├─ MarketSummary     → GET /api/portfolio/overall-analysis + GET /api/market/alerts
├─ PreMarketData     → GET /api/market/pre-market-data
├─ NikkeiSummary     → GET /api/market/nikkei + /api/market/nikkei/historical + /api/portfolio/history
├─ PortfolioSummary  → GET /api/portfolio/summary + 株価取得
├─ BudgetSummary     → GET /api/budget/summary
├─ PortfolioHistoryChart → GET /api/portfolio/history
├─ PortfolioCompositionChart → GET /api/portfolio/composition
├─ GeopoliticalRiskCard → GET /api/news/geopolitical
├─ SectorTrendHeatmap → GET /api/sector-trends
├─ DailyHighlights   → GET /api/highlights
├─ ScreeningResults  → GET /api/screening
└─ MarketMovers      → GET /api/market-analysis/gainers-losers
```

## コンポーネント一覧

| コンポーネント | ファイル | 役割 |
|---------------|----------|------|
| DashboardClient | `DashboardClient.tsx` | クライアントラッパー、PWAインストール促進 |
| MarketSummary | `MarketSummary.tsx` | 市場環境サマリー（最上部統合カード） |
| MarketAlertBanner | `MarketAlertBanner.tsx` | 市場警戒アラートバナー |
| PreMarketData | `PreMarketData.tsx` | 海外市場データ表示 |
| NikkeiSummary | `NikkeiSummary.tsx` | 日経225指数表示 |
| PortfolioSummary | `PortfolioSummary.tsx` | ポートフォリオKPI表示 |
| BudgetSummary | `BudgetSummary.tsx` | 予算配分表示 |
| PortfolioHistoryChart | `PortfolioHistoryChart.tsx` | 資産推移/損益推移チャート |
| PortfolioCompositionChart | `PortfolioCompositionChart.tsx` | 構成比率円グラフ |
| GeopoliticalRiskCard | `GeopoliticalRiskCard.tsx` | 地政学・マクロリスクカード |
| SectorTrendHeatmap | `SectorTrendHeatmap.tsx` | セクタートレンドヒートマップ |
| DailyHighlights | `DailyHighlights.tsx` | 今日の注目データカード群 |
| ScreeningResults | `ScreeningResults.tsx` | スクリーニング結果カード群 |

## 関連ファイル

- `app/dashboard/page.tsx` - ページエントリ（Server Component）
- `app/dashboard/DashboardClient.tsx` - クライアントラッパー
- `app/dashboard/MarketSummary.tsx` - 市場環境サマリーコンポーネント
- `app/dashboard/MarketAlertBanner.tsx` - 市場警戒アラートバナー
- `app/dashboard/PreMarketData.tsx` - 海外市場データコンポーネント
- `app/api/portfolio/overall-analysis/route.ts` - 市場環境サマリー API
- `app/api/market/alerts/route.ts` - 市場警戒アラート API
- `app/api/market/pre-market-data/route.ts` - 海外市場データ API
- `app/api/market/nikkei/route.ts` - 日経225 API
- `app/api/portfolio/summary/route.ts` - ポートフォリオサマリー API
- `app/api/portfolio/history/route.ts` - 資産推移 API
- `app/api/portfolio/composition/route.ts` - 構成比率 API
- `app/api/budget/summary/route.ts` - 予算サマリー API
- `app/dashboard/GeopoliticalRiskCard.tsx` - 地政学リスクカード
- `app/api/news/geopolitical/route.ts` - 地政学ニュース API
- `app/api/sector-trends/route.ts` - セクタートレンド API
- `app/api/highlights/route.ts` - 今日の注目データ API
- `app/dashboard/DailyHighlights.tsx` - 今日の注目データコンポーネント
- `app/dashboard/ScreeningResults.tsx` - スクリーニング結果コンポーネント
- `app/api/screening/route.ts` - スクリーニング API
- `app/api/market-analysis/gainers-losers/route.ts` - 市場ランキング API
