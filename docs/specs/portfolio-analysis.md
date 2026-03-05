# ポートフォリオ分析 仕様書

## 概要

ポートフォリオ分析はユーザーの保有銘柄全体を評価する機能です。個別銘柄のヘルスチェックと、ポートフォリオ全体の市場環境サマリーを提供します。

> **注意**: 売買の推奨（buy/hold/sell等）は行いません。データに基づく分析結果とリスクフラグを提示し、投資判断はユーザー自身が行います。

**ページパス**: `/portfolio-analysis`

## 分析の種類

### 1. 個別銘柄ヘルスチェック（PortfolioStock単位）

保有銘柄ごとにAIが健全性スコアとリスクフラグを生成します。

**分析に使用するデータ**:
- 株価データ（3ヶ月分のOHLCV）
- テクニカル指標（RSI, MACD, 移動平均乖離率）
- チャートパターン（逆三尊、ダブルボトム等）
- ローソク足パターン分析
- 出来高分析
- 窓埋め判定
- 支持線・抵抗線
- トレンドライン
- 財務指標（PER, PBR, ROE, 配当利回りなど20以上）
- 関連ニュース（7日分）
- セクタートレンド
- 日経225の動向
- 地政学リスク指標（VIX・WTI）
- 決算・配当落ちスケジュール
- 相対強度（市場/セクター比較）
- ユーザー設定（投資スタイル、売却目標/撤退ライン）

**AI出力スキーマ**:

```json
{
  "marketSignal": "bullish | neutral | bearish",
  "healthScore": 72,
  "riskLevel": "high | medium | low",
  "shortTerm": "短期分析テキスト（事実ベース、売買推奨なし）",
  "mediumTerm": "中期分析テキスト",
  "longTerm": "長期分析テキスト",
  "shortTermTrend": "up | neutral | down",
  "midTermTrend": "up | neutral | down",
  "longTermTrend": "up | neutral | down",
  "isCriticalChange": false,
  "positives": "ポジティブな事実（箇条書き）",
  "concerns": "注意すべき事実（箇条書き）",
  "styleAnalyses": {
    "CONSERVATIVE": {
      "score": 65,
      "keyPoints": "安定配当型の視点からの注目ポイント",
      "risks": "このスタイルにとってのリスク要因",
      "opportunities": "このスタイルにとっての好材料"
    },
    "BALANCED": { "...": "同上" },
    "AGGRESSIVE": { "...": "同上" }
  }
}
```

**リスクフラグ（旧: 安全補正ルール）**:

売買推奨の上書きは行わない。代わりに、以下の条件に該当する場合はリスクフラグとして表示する。

| # | フラグ名 | 条件 | 表示テキスト例 |
|---|----------|------|--------------|
| 1 | 大幅下落 | MA乖離率 ≤ -20% | 「移動平均線から大幅に下方乖離（-XX%）」 |
| 2 | 上場廃止 | isDelisted = true | 「上場廃止」 |
| 3 | 赤字×高ボラ | 赤字 + ボラティリティ > 50% | 「赤字企業かつ高ボラティリティ」 |
| 4 | 短期下降トレンド | 短期予測トレンドが「down」 | 「短期トレンドは下降」 |
| 5 | 急騰中 | 週間変化率が大幅プラス | 「急騰中（週間+XX%）」 |
| 6 | 決算直前 | 決算発表まで3日以内 | 「決算発表まであとX日」 |
| 7 | 全面下降トレンド | 短期・中期・長期すべてdown | 「短期・中期・長期すべて下降トレンド」 |
| 8 | 業績悪化 | 赤字 + 減益トレンド | 「業績悪化傾向（赤字＋減益）」 |

**テクニカル参考値**:

| 項目 | 説明 |
|------|------|
| 支持線（Support Level） | 直近の主要な支持線価格 |
| 抵抗線（Resistance Level） | 直近の主要な抵抗線価格 |
| ATR14 | 14日間の平均的な値幅 |

**トレンド乖離状況（Trend Divergence）**:

短期トレンドと長期トレンドの方向が異なる場合、乖離の種類を検出して事実として表示する。

```json
{
  "trendDivergence": {
    "divergenceType": "short_down_long_up | short_up_long_down | aligned",
    "description": "短期トレンドは下降、長期トレンドは上昇で乖離しています",
    "keyLevel": 2350
  }
}
```

**投資スタイル別分析（styleAnalyses）**:

AIが1回のAPIコールで3つの投資スタイル（安定配当型/成長投資型/アクティブ型）ごとに異なるスコアと注目ポイントを生成する。

| スタイル | 重視する観点 | 注目ポイントの例 |
|----------|-------------|----------------|
| 安定配当型（CONSERVATIVE） | 配当利回り、財務健全性、低ボラティリティ | 「配当利回り3.5%、支持線を維持中」 |
| 成長投資型（BALANCED） | 売上成長率、中期トレンド | 「売上成長率+15%、中期トレンドは上昇」 |
| アクティブ型（AGGRESSIVE） | モメンタム、出来高、短期テクニカル | 「出来高が20日平均の3倍、直近高値を更新」 |

スタイル別の結果は `StockAnalysis.styleAnalyses` に JSON として保存され、フロントエンドでタブ切り替えにより比較表示できます。

### 2. 市場環境サマリー（旧: Daily Market Navigator）

ポートフォリオ全体を市場の流れと照合するカード型UIです。朝と夜の2セッションで異なる視点の分析を提供します。

> **注意**: 行動指示（「攻めろ」「守れ」等）は行いません。市場環境の事実を整理して提示します。

**前提条件**: なし（0銘柄でも表示。ポートフォリオがない場合は市場分析とセクター動向を提供）

**表示場所**:
- `/dashboard` の最上部
- `/portfolio-analysis`（専用ページ）

**セッション**:

| セッション | 生成タイミング | 内容 |
|-----------|---------------|------|
| 朝（morning） | 9:00 JST | 今日の市場環境。海外市場動向・先物・為替の整理 |
| 夜（evening） | 15:30 JST | 今日の振り返り。市場の動き・持ち株の変化点 |

UIはJST 15時を境にデフォルトセッションを自動切替。タブで手動切替も可能。

**ポートフォリオ有無による分岐**:

| パターン | Section 2 の表示 |
|---------|-----------------|
| ポートフォリオあり | 「あなたのポートフォリオ」+ ステータスバッジ + 関連データの変化点 |
| ポートフォリオなし | 「市場動向サマリー」+ セクター別動向 |

**分析に使用するデータ**:
- セクター構成・集中率
- 含み損益・総資産額・投資額
- ポートフォリオ全体のボラティリティ（加重平均）
- 業績状況（黒字銘柄数、増益/減益傾向）
- 銘柄別の日次値動き（前日比・週間変化率・MA乖離・出来高比）
- 本日の売却取引
- 市場概況（日経225の現在価格・週間変動・トレンド、S&P 500の現在価格・週間変動・トレンド、NASDAQの終値・前日比）
- ベンチマーク比較（日経225・S&P 500との超過リターン・ベータ値、直近1ヶ月）
- ポートフォリオ内セクターのセクタートレンド
- 今後7日間の決算予定銘柄
- ユーザーの投資スタイル

**AI出力スキーマ**:

```json
{
  "marketHeadline": "市況を1文で要約したテキスト",
  "marketTone": "bullish | bearish | neutral | sector_rotation",
  "marketKeyFactor": "市場の主要因（事実ベース、1〜2文）",
  "portfolioStatus": "healthy | caution | warning | critical",
  "portfolioSummary": "ポートフォリオの状態（事実ベース、1〜2文）",
  "keyPoints": "市場環境の要点。事実の整理（行動指示は含まない）",
  "buddyMessage": "親しみやすい口調で初心者を勇気づける1文",
  "stockHighlights": [
    {
      "stockName": "銘柄名",
      "tickerCode": "7203.T",
      "sector": "輸送用機器",
      "dailyChangeRate": -2.3,
      "weekChangeRate": 1.5,
      "analysis": "値動きの事実分析テキスト"
    }
  ],
  "sectorHighlights": [
    {
      "sector": "半導体",
      "avgDailyChange": -3.1,
      "trendDirection": "up | down | neutral",
      "compositeScore": -25,
      "commentary": "セクター動向の事実コメント"
    }
  ]
}
```

**バッジの色分け**:

| 種類 | 値 | 色 |
|------|----|----|
| tone（市場トーン） | `bullish` | 緑（green） |
| tone（市場トーン） | `bearish` | 赤（red） |
| tone（市場トーン） | `neutral` | グレー（gray） |
| tone（市場トーン） | `sector_rotation` | 琥珀（amber） |
| status（ポートフォリオ状態） | `healthy` | 緑（green） |
| status（ポートフォリオ状態） | `caution` | 琥珀（amber） |
| status（ポートフォリオ状態） | `warning` | オレンジ（orange） |
| status（ポートフォリオ状態） | `critical` | 赤（red） |

**UIの構成（統合カード型）**:

| セクション | 内容 |
|-----------|------|
| Section 1: 市場 | `marketHeadline` + `marketTone` バッジ + `marketKeyFactor` |
| Section 2: ポートフォリオ / 市場動向サマリー | `portfolioStatus` バッジ + `portfolioSummary` + `keyPoints` |
| Section 3: バディメッセージ | `buddyMessage`（紫背景の吹き出し） |
| Section 4: 詳細（折りたたみ） | `stockHighlights` + `sectorHighlights` |
| フッター | 分析日時 |

### 3. 銘柄比較（旧: スマートスイッチ）

2銘柄のデータを並べて比較する機能。ユーザーが自分で比較したい銘柄を選択する。

**表示場所**: 銘柄詳細ページ or 専用ページ

詳細は [stock-comparison.md](stock-comparison.md) を参照。

## API仕様

### 個別銘柄ヘルスチェック

#### `GET /api/stocks/[stockId]/portfolio-analysis`

最新の分析結果を取得。

#### `POST /api/stocks/[stockId]/portfolio-analysis`

新しい分析を生成。

**認証**: セッション認証 or CRON_SECRET

### 市場環境サマリー

#### `GET /api/portfolio/overall-analysis`

キャッシュされた市場環境サマリーを取得。

**クエリパラメータ**:
- `session` (optional): `morning` | `evening`。未指定時はJST時刻で自動判定（15時以降は `evening`）

**レスポンス**:

```json
{
  "hasAnalysis": true,
  "analyzedAt": "2026-02-26T10:00:00.000Z",
  "isToday": true,
  "session": "morning",
  "hasPortfolio": true,
  "portfolioCount": 3,
  "watchlistCount": 2,
  "market": {
    "headline": "半導体セクターが相場を牽引、全体的にリスクオンの展開",
    "tone": "bullish",
    "keyFactor": "外国人投資家の買い越しが続き、輸出関連銘柄に追い風"
  },
  "portfolio": {
    "status": "healthy",
    "summary": "保有銘柄の多くが市場と同じ方向に動いています",
    "keyPoints": "日経225は+1.2%上昇。保有セクターの半導体・自動車がいずれも上昇",
    "metrics": {
      "totalValue": 1500000,
      "totalCost": 1200000,
      "unrealizedGain": 300000,
      "unrealizedGainPercent": 25.0,
      "portfolioVolatility": 28.5,
      "sectorConcentration": 40.0,
      "sectorCount": 3
    }
  },
  "buddyMessage": "今日の市場は活発でしたね。データをじっくり確認してみましょう！",
  "details": {
    "stockHighlights": [],
    "sectorHighlights": []
  }
}
```

#### `POST /api/portfolio/overall-analysis`

市場環境サマリーを再生成。

**認証**: セッション認証 or CRON_SECRET

### 市場警戒アラート（旧: マーケットシールド）

#### `GET /api/market/alerts`

市場の警戒状態を取得。売買の凍結は行わず、事実をアラートとして返す。

**レスポンス**:
```json
{
  "alerts": [
    {
      "type": "vix_spike",
      "value": 32.5,
      "message": "VIXが30を超えています（現在32.5）",
      "detectedAt": "2026-03-05T01:00:00.000Z"
    }
  ]
}
```

### ベンチマーク比較

#### `GET /api/portfolio/benchmark-metrics?period={1m|3m|6m|1y}`

ポートフォリオと日経225のベンチマーク比較指標を計算。

### ポートフォリオサマリー

#### `GET /api/portfolio/summary`

### ポートフォリオ構成

#### `GET /api/portfolio/composition`

### 資産推移

#### `GET /api/portfolio/history?period={1m|3m|6m|1y}`

## AI設定

### 個別銘柄ヘルスチェック

| 項目 | 値 |
|------|-----|
| モデル | OpenAI GPT-4o-mini |
| Temperature | 0.3（分析的） |
| レスポンス形式 | JSON Schema（strict mode） |
| 最大トークン | 1600 |

### 市場環境サマリー

| 項目 | 値 |
|------|-----|
| モデル | OpenAI GPT-4o-mini |
| Temperature | 0.3 |
| レスポンス形式 | JSON Schema（strict mode） |

## プロンプト設計原則

- **投資助言の禁止**: 売買の推奨、価格予想、タイミング指示を出力しない
- **事実ベース**: すべての分析に客観的データを引用
- **ハルシネーション防止**: 提供されたデータ以外を引用しない
- **初心者向け言語**: 専門用語 + 必ず解説を付与

## データモデル

### StockAnalysis（個別銘柄ヘルスチェック）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | String | PK |
| stockId | String | FK → Stock |
| analyzedAt | DateTime | 分析日時 |
| healthScore | Int | 銘柄健全性スコア (0-100) |
| riskLevel | String | リスクレベル (high/medium/low) |
| riskFlags | Json | リスクフラグ配列 |
| marketSignal | String | 市場シグナル |
| shortTermTrend | String | 短期トレンド |
| shortTermAnalysis | String | 短期分析テキスト |
| midTermTrend | String | 中期トレンド |
| midTermAnalysis | String | 中期分析テキスト |
| longTermTrend | String | 長期トレンド |
| longTermAnalysis | String | 長期分析テキスト |
| analysisText | String | 総合分析テキスト |
| positives | String | ポジティブな事実 |
| concerns | String | 注意すべき事実 |
| supportLevel | Float? | 直近支持線 |
| resistanceLevel | Float? | 直近抵抗線 |
| styleAnalyses | Json | 投資スタイル別分析 |
| trendDivergence | Json? | トレンド乖離状況 |

### PortfolioOverallAnalysis（市場環境サマリー）

ユーザー × セッションごとに1レコードを upsert で保存。

| カラム | 型 | 説明 |
|--------|-----|------|
| userId | String | ユーザーID |
| session | String | セッション（morning / evening） |
| analyzedAt | DateTime | 分析日時 |
| sectorConcentration | Decimal? | 最大セクター比率(%) |
| sectorCount | Int? | セクター数 |
| totalValue | Decimal? | 総資産額 |
| totalCost | Decimal? | 総投資額 |
| unrealizedGain | Decimal? | 含み損益 |
| unrealizedGainPercent | Decimal? | 含み損益率(%) |
| portfolioVolatility | Decimal? | ボラティリティ(%) |
| marketHeadline | Text | 市場ヘッドライン |
| marketTone | String | bullish / bearish / neutral / sector_rotation |
| marketKeyFactor | Text | 市場の主要因 |
| portfolioStatus | String | healthy / caution / warning / critical |
| portfolioSummary | Text | ポートフォリオ状態の事実整理 |
| keyPoints | Text | 市場環境の要点（旧: actionPlan） |
| buddyMessage | Text | バディメッセージ |
| stockHighlights | Json | 銘柄ハイライト |
| sectorHighlights | Json | セクターハイライト |

### PortfolioSnapshot

| カラム | 型 | 説明 |
|--------|-----|------|
| userId | String | ユーザーID |
| date | Date | スナップショット日付 |
| totalValue | Decimal | 総資産額 |
| totalCost | Decimal | 総投資額 |
| unrealizedGain | Decimal | 含み損益 |
| unrealizedGainPercent | Decimal | 損益率(%) |
| stockCount | Int | 保有銘柄数 |
| sectorBreakdown | Json? | セクター別内訳 |
| stockBreakdown | Json? | 銘柄別内訳 |
| nikkeiClose | Decimal? | 日経225終値 |
| sp500Close | Decimal? | S&P 500終値 |

## 関連ファイル

- `app/portfolio-analysis/` - ポートフォリオ分析ページ
- `app/dashboard/DailyMarketNavigator.tsx` - 市場環境サマリーコンポーネント
- `app/api/portfolio/overall-analysis/route.ts` - 市場環境サマリー API
- `lib/portfolio-overall-analysis.ts` - 市場環境サマリーロジック
- `lib/portfolio-analysis-core.ts` - 個別銘柄ヘルスチェックロジック
- `lib/portfolio-calculator.ts` - 計算ロジック
- `lib/style-analysis.ts` - 投資スタイル別分析
- `lib/prompts/portfolio-analysis-prompt.ts` - 個別分析プロンプト
- `lib/prompts/portfolio-overall-analysis-prompt.ts` - 市場環境サマリープロンプト
