# AIレコメンド 仕様書

## 概要

Stock Buddyの中核機能であるAI推奨システムです。3種類の推奨を生成し、結果を追跡して精度を検証します。

## 推奨の種類

### 1. 日次おすすめ（UserDailyRecommendation）

ユーザーごとに1日最大5銘柄をAIが選定。

**生成タイミング**: 取引日の3セッション（朝9時 / 昼12:30 / 夕15:35 JST）

**生成フロー**:
1. 全ユーザーの投資設定を取得
2. ユーザーごとに並列処理（最大3並列）:
   a. 残り予算を計算
   b. 対象銘柄を取得（最新株価データあり）
   c. スコアリング（投資スタイル別重み + ペナルティ）
   d. セクター分散フィルタ（1セクター最大5銘柄）
   e. 予算フィルタ（100株購入可能なもの）
   f. 上位20銘柄をOpenAIに送信
   g. AIが5銘柄を選定 + 理由生成
3. `UserDailyRecommendation` テーブルに保存

**投資テーマ**:
- `短期成長` - 直近の上昇モメンタムが強い銘柄
- `中長期安定成長` - 安定した業績と成長性
- `高配当` - 高い配当利回り
- `割安反発` - PBR/PERが低く反発期待
- `テクニカル好転` - テクニカル指標が買いシグナル
- `安定ディフェンシブ` - 低ボラティリティで守備的

**投資スタイル別の選定基準**:

| 基準 | 保守的 | バランス | 積極的 |
|------|--------|----------|--------|
| 時価総額 | 大型中心 | 混合 | 小〜中型含む |
| ボラティリティ | 低 | 中 | 高も許容 |
| 黒字必須 | 必須 | 基本的に黒字 | 赤字も許容 |
| モメンタム重視 | 低 | 中 | 高 |

**API**: `POST /api/recommendations/generate-daily`

**認証**: CRON_SECRET

### 2. 購入判断（PurchaseRecommendation）

ウォッチリスト銘柄ごとに buy / stay / avoid の判断を生成。

**生成タイミング**: 取引日の3セッション

**入力データ**:
- 財務指標（20以上の指標）
- 30日分の株価データ
- テクニカル指標（RSI, MACD）
- ローソク足パターン分析
- チャートパターン（三尊、ダブルボトム等）
- 出来高分析
- 相対強度（市場/セクター比較）
- 関連ニュース（7日分）
- AI予測（StockAnalysis があれば）
- 日経225のデータ
- セクタートレンド

**AI出力スキーマ**:
```json
{
  "marketSignal": "bullish | neutral | bearish",
  "statusType": "即時売却 | 戻り売り | ホールド | 押し目買い | 全力買い",
  "recommendation": "buy | stay | avoid",
  "confidence": 0.85,
  "reason": "推奨理由",
  "caution": "注意点",
  "positives": "良いところ（箇条書き）",
  "concerns": "不安な点（箇条書き）",
  "suitableFor": "こんな人向け",
  "buyCondition": "stayの時、どうなったら買い時か",
  "buyTiming": "market | dip",
  "dipTargetPrice": 2300,
  "userFitScore": 78,
  "budgetFit": true,
  "periodFit": true,
  "riskFit": true,
  "personalizedReason": "パーソナライズされた理由"
}
```

**安全補正ルール（ハードオーバーライド）**:

| # | ルール | 条件 | 動作 |
|---|--------|------|------|
| 1 | テクニカル売りシグナル | RSI/MACD/ローソク足の70%以上が売り | buy → stay |
| 2 | avoid信頼度ゲート | avoidの場合、confidence < 0.8 | avoid → stay |
| 3 | 下落トレンドロック | 週間下落 ≥ -7% | buy → stay |
| 4 | 急騰ロック | 週間上昇 ≥ 30% | buy → stay |
| 5 | 危険銘柄ロック | 赤字 + ボラティリティ > 50% | buy → stay |
| 6 | 市場暴落 | 日経225が暴落中 | buy → stay |
| 7 | 過熱チェック | MA乖離率 > +25% | buy → stay |
| 8 | パニック売り防止 | MA乖離率 < -5% + avoid | avoid → stay |

**買いタイミングロジック**:
- `dip`（押し目買い）: RSI > 70 or MA乖離 > 15% → 下がるまで待つ
- `market`（成り行き）: 上記以外 → すぐ購入OK

**投資スタイル別分析（styleAnalyses）**:

非スタイル依存の安全補正を適用した後、3つの投資スタイル（慎重派/バランス型/積極派）ごとにスタイル依存の補正を適用し、スタイル別の分析結果を生成。結果は `PurchaseRecommendation.styleAnalyses` と `StockAnalysis.styleAnalyses` に JSON として保存。

| スタイル依存補正 | 条件（スタイルにより閾値が異なる） | 動作 |
|------------------|--------------------------------------|------|
| 下落トレンドロック | `isInDecline(weekChangeRate, style)` | buy → stay |
| 急騰ロック | `isSurgeStock(weekChangeRate, style)` | buy → stay |
| 過熱チェック | `isOverheated(deviationRate, style)` | buy → stay |

フロントエンドでタブ切り替えにより3スタイルの結果を比較表示できます。

**API**: `POST /api/stocks/[stockId]/purchase-recommendation`

### 3. ポートフォリオ分析（StockAnalysis）

保有銘柄の売買判断。詳細は [portfolio-analysis.md](portfolio-analysis.md) を参照。

## 結果追跡（RecommendationOutcome）

すべての推奨の結果を追跡し、AI精度を検証します。

**追跡データ**:

| カラム | 説明 |
|--------|------|
| type | daily / purchase / analysis |
| recommendationId | 元の推奨レコードID |
| stockId / tickerCode / sector | 銘柄情報 |
| recommendedAt | 推奨日時 |
| priceAtRec | 推奨時の株価 |
| prediction | buy / stay / remove / up / down / neutral |
| confidence | 信頼度 |
| volatility / marketCap | 推奨時点の指標 |
| sectorTrendScore / Direction | セクタートレンド |
| returnAfter1Day | 1日後のリターン(%) |
| returnAfter3Days | 3日後のリターン(%) |
| returnAfter7Days | 7日後のリターン(%) |
| returnAfter14Days | 14日後のリターン(%) |
| benchmarkReturn7Days | 7日後の日経225リターン(%) |

**成功基準**（prediction別）:

| prediction | 成功条件 |
|------------|----------|
| buy | リターン > -3%（大損を避ける） |
| stay | リターン ≤ 5%（見送って正解） |
| remove | リターン < 3%（除外して正解） |
| up | リターン > -3%（方向概ね正しい） |
| down | リターン < 3%（方向概ね正しい） |
| neutral | リターン ±5%以内（安定予測） |

**評価タイミング**: 毎営業日16:00 JST（市場終了後）

**API**: `POST /api/reports/recommendation-outcomes`

## AI設定

| 推奨タイプ | モデル | Temperature | 出力形式 |
|-----------|--------|-------------|----------|
| 日次おすすめ | GPT-4o-mini | 0.4 | JSON Schema |
| 購入判断 | GPT-4o-mini | 0.4 | JSON Schema |
| ポートフォリオ分析 | GPT-4o-mini | 0.3 | JSON Schema |

## プロンプト設計原則

- **ハルシネーション防止**: 提供されたニュース以外を引用しない明示的指示
- **初心者向け言語**: 専門用語 + 必ず解説を付与
- **エビデンス必須**: すべての判断に根拠を引用
- **安全優先**: AI予測よりも安全ルールを優先
- **パーソナライズ**: ユーザーの投資スタイル・予算に合わせた文脈

## 関連ファイル

- `app/api/recommendations/generate-daily/route.ts` - 日次おすすめ生成
- `app/api/featured-stocks/route.ts` - おすすめ銘柄取得
- `lib/purchase-recommendation-core.ts` - 購入判断ロジック
- `lib/style-analysis.ts` - 投資スタイル別補正ロジック
- `lib/recommendation-scoring.ts` - スコアリング
- `lib/stock-safety-rules.ts` - 安全ルール
- `lib/outcome-utils.ts` - 結果追跡ユーティリティ
- `lib/prompts/daily-recommendation-prompt.ts` - 日次おすすめプロンプト
- `lib/prompts/purchase-recommendation-prompt.ts` - 購入判断プロンプト
- `lib/prompts/portfolio-analysis-prompt.ts` - ポートフォリオ分析プロンプト
