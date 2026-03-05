# 銘柄分析レポート 仕様書

## 概要

ウォッチリスト銘柄ごとにテクニカルスコア・財務健全性ランク・注意フラグを生成する機能です。

> **注意**: 売買の推奨（buy/stay/avoid等）は行いません。データに基づく分析結果を提示し、投資判断はユーザー自身が行います。

## 生成タイミング

取引日の3セッション（morning / pre-afternoon / close）

## 入力データ

- 財務指標（20以上の指標）
- 3ヶ月分の株価データ（SMA25計算に25営業日以上が必要）
- テクニカル指標（RSI, MACD, 移動平均乖離率）
- ローソク足パターン分析
- チャートパターン（三尊、ダブルボトム等）
- 出来高分析
- トレンドライン
- タイミング補助指標（ギャップアップ率、出来高急増率、売買代金）
- 相対強度（市場/セクター比較）
- 関連ニュース（7日分）
- 日経225のデータ
- セクタートレンド
- 地政学リスク指標（VIX・WTI）
- 決算・配当落ちスケジュール

## AI出力スキーマ

```json
{
  "technicalScore": 72,
  "fundamentalScore": 65,
  "healthRank": "B",
  "marketSignal": "bullish | neutral | bearish",
  "shortTermTrend": "up | neutral | down",
  "shortTermText": "短期分析テキスト（テクニカル指標名と数値を含む事実分析。売買推奨は含まない）",
  "midTermTrend": "up | neutral | down",
  "midTermText": "中期分析テキスト",
  "longTermTrend": "up | neutral | down",
  "longTermText": "長期分析テキスト",
  "positives": "ポジティブな事実（箇条書き）",
  "concerns": "注意すべき事実（箇条書き）",
  "suitableFor": "こんな投資スタイルに適した特徴がある",
  "styleAnalyses": {
    "CONSERVATIVE": {
      "score": 68,
      "keyPoints": "安定配当型の視点からの注目ポイント",
      "risks": "このスタイルにとってのリスク要因",
      "opportunities": "このスタイルにとっての好材料"
    },
    "BALANCED": { "...": "同上" },
    "AGGRESSIVE": { "...": "同上" }
  }
}
```

### スコアとランクの定義

**テクニカルスコア (0-100)**:
- テクニカル指標（RSI, MACD, 移動平均等）の総合評価
- 高いほどテクニカル的に良好な状態

**ファンダメンタルスコア (0-100)**:
- 財務指標（PER, PBR, ROE, 配当利回り等）の総合評価
- 高いほど財務的に良好な状態

**財務健全性ランク (A-E)**:
- A: 非常に良好（黒字安定、低負債、高配当）
- B: 良好
- C: 普通
- D: 注意が必要
- E: リスクが高い（赤字、高負債等）

## トレンド乖離状況（Trend Divergence）

短期/中期/長期トレンドの乖離状態を分析し、事実として表示する。

```json
{
  "trendDivergence": {
    "divergenceType": "short_down_long_up | short_up_long_down | aligned",
    "description": "短期トレンドは下降、長期トレンドは上昇で乖離しています",
    "keyLevel": 2350,
    "triggerCondition": "RSIが40を回復し25日線を上抜けたら転換サイン"
  }
}
```

- `divergenceType`: トレンドの乖離タイプ。`aligned` の場合は乖離なし
- `description`: 乖離状況の説明（事実ベース）
- `keyLevel`: テクニカル的に注目される価格水準（支持線/抵抗線）
- `triggerCondition`: トレンド転換のトリガー条件（事実ベース）

※ 「収束予測日数」や「待機アドバイス」は廃止。事実の提示のみ行う。

## 注意フラグ（旧: 安全補正ルール）

売買推奨の上書きは行わない。代わりに、以下の条件に該当する場合は注意フラグとして表示する。

| # | フラグ名 | 条件 | 表示テキスト例 |
|---|----------|------|--------------|
| 1 | テクニカル売りシグナル | RSI/MACD/ローソク足の売りシグナル強度が閾値以上 | 「テクニカル指標が売りシグナルを示しています」 |
| 2 | 赤字×高ボラティリティ | 赤字 + ボラティリティ > 50% | 「赤字企業かつ高ボラティリティ」 |
| 3 | 赤字×急騰 | 赤字企業が週間+20%以上急騰 | 「赤字企業の急騰（週間+XX%）」 |
| 4 | ギャップアップ急騰 | ギャップアップ率が閾値以上 | 「大幅ギャップアップ（+XX%）」 |
| 5 | 異常出来高 | 出来高急増率が極端閾値以上 | 「出来高が通常の XX倍に急増」 |
| 6 | 市場急落 | 日経225が大幅下落中 | 「日経225が大幅下落中（-XX%）」 |
| 7 | 決算直前 | 決算発表まで3日以内 | 「決算発表まであとX日」 |
| 8 | 短期下降トレンド | AI短期予測トレンドが「down」 | 「短期トレンドは下降」 |
| 9 | 大幅下落中 | MA乖離率が大きくマイナス | 「移動平均線から大幅に乖離（-XX%）」 |
| 10 | 業績悪化 | 赤字 + 減益トレンド | 「業績悪化傾向（赤字＋減益）」 |
| 11 | 急騰中 | 週間変化率が大幅プラス | 「急騰中（週間+XX%）」 |
| 12 | MA乖離過熱 | MA乖離率が大幅プラス | 「移動平均線から大幅に上方乖離（+XX%）」 |

## テクニカル参考値

価格予想は行わない。代わりに過去データから算出されたテクニカル参考値を表示する。

| 項目 | 説明 |
|------|------|
| 支持線（Support Level） | 直近の主要な支持線価格（過去データから算出） |
| 抵抗線（Resistance Level） | 直近の主要な抵抗線価格（過去データから算出） |
| ATR14 | 14日間の平均的な値幅（ボラティリティの指標） |
| 52週高値/安値 | 過去1年間の最高値/最安値 |

## 投資スタイル別分析（styleAnalyses）

AIが1回のAPIコールで3つの投資スタイル（安定配当型/成長投資型/アクティブ型）ごとに異なるスコアと注目ポイントを生成する。

| スタイル | 重視する観点 | 注目ポイントの例 |
|----------|-------------|----------------|
| 安定配当型（CONSERVATIVE） | 配当利回り、財務健全性、低ボラティリティ | 「配当利回り3.5%、10期連続増配」 |
| 成長投資型（BALANCED） | 売上成長率、PEG、中期トレンド | 「売上成長率+15%、PERはセクター平均以下」 |
| アクティブ型（AGGRESSIVE） | モメンタム、出来高、短期テクニカル | 「出来高が20日平均の3倍、直近高値を更新」 |

## AI設定

| モデル | Temperature | 出力形式 |
|--------|-------------|----------|
| GPT-4o-mini | 0.4 | JSON Schema |

## プロンプト設計原則

- **投資助言の禁止**: 売買の推奨、価格予想、タイミング指示を出力しない
- **事実ベース**: すべての分析に客観的データを引用
- **ハルシネーション防止**: 提供されたニュース以外を引用しない明示的指示
- **初心者向け言語**: 専門用語 + 必ず解説を付与
- **エビデンス必須**: すべての分析に根拠を引用

## API

| エンドポイント | 認証 | 説明 |
|---------------|------|------|
| `GET /api/stocks/[stockId]/report` | session | 銘柄分析レポート取得 |
| `POST /api/stocks/[stockId]/report` | session | 銘柄分析レポート生成 |

## データモデル

### StockReport（旧: PurchaseRecommendation）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | String | PK |
| stockId | String | FK → Stock |
| date | DateTime @db.Date | 分析日（JST基準） |
| technicalScore | Int | テクニカルスコア (0-100) |
| fundamentalScore | Int | ファンダメンタルスコア (0-100) |
| healthRank | String | 財務健全性ランク (A-E) |
| marketSignal | String | 市場シグナル (bullish/neutral/bearish) |
| shortTermTrend | String | 短期トレンド |
| shortTermAnalysis | String | 短期分析テキスト |
| midTermTrend | String | 中期トレンド |
| midTermAnalysis | String | 中期分析テキスト |
| longTermTrend | String | 長期トレンド |
| longTermAnalysis | String | 長期分析テキスト |
| analysisText | String | 総合分析テキスト |
| positives | String | ポジティブな事実 |
| concerns | String | 注意すべき事実 |
| suitableFor | String | 適した投資スタイルの特徴 |
| alerts | Json | 注意フラグ配列 |
| supportLevel | Float? | 直近支持線 |
| resistanceLevel | Float? | 直近抵抗線 |
| styleAnalyses | Json | 投資スタイル別分析 |
| trendDivergence | Json? | トレンド乖離状況 |
| createdAt | DateTime | 作成日時 |

ユニーク制約: (stockId, date)

## 関連ファイル

- `lib/stock-report-core.ts`（旧: `lib/purchase-recommendation-core.ts`） - 分析レポートロジック
- `lib/style-analysis.ts` - 投資スタイル別分析
- `lib/stock-safety-rules.ts` - 注意フラグ検出ルール
- `lib/prompts/stock-report-prompt.ts`（旧: `lib/prompts/purchase-recommendation-prompt.ts`） - レポートプロンプト
- `lib/stock-analysis-context.ts` - 分析コンテキスト生成
