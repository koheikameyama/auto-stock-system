# 今日の注目データ 仕様書

## 概要

ユーザーごとに1日最大5銘柄を客観的条件でピックアップする機能です。
DB内の全銘柄（~4,465銘柄）をスクリーニングし、注目すべきデータ変化がある銘柄を表示します。

> **注意**: 売買の推奨は行いません。「出来高急増」「チャートパターン出現」「決算発表予定」等の客観的な事実に基づいて銘柄をピックアップし、投資判断はユーザー自身が行います。

## 生成タイミング

取引日の3セッション（朝9時 / 昼12:30 / 夕15:35 JST）

## 生成フロー

1. 全ユーザーの投資設定を取得
2. 対象銘柄を一括取得（最新株価データあり、上場廃止・データ取得失敗を除外）
3. ユーザーごとに並列処理（最大3並列）:
   a. 予算フィルタ（`latestPrice × 100 <= investmentBudget` で1単元購入可能な銘柄に絞り込み）
   b. 注目条件フィルタ（客観的条件で「データ変化がある」銘柄のみ通過）
   c. スコアリング（投資スタイル別重み + セクタートレンドボーナス）
   d. セクターキャップ（同一セクター最大2銘柄）
   e. 上位15銘柄をOpenAIに送信
   f. AIが7銘柄を選定 + 注目理由生成
   g. 上位5銘柄を保存
4. `DailyHighlight` テーブルに保存

## 予算フィルタ

投資予算（総額）で1単元（100株）購入可能な銘柄のみを候補とする。

- 条件: `latestPrice × 100 <= investmentBudget`
- 予算未設定の場合はフィルタなし

## 注目条件フィルタ（旧: 買い候補フィルタ）

銘柄の「データ変化」を客観的条件で検出する。買い推奨ではなく「注目に値するデータ変化があるか」を判定。

### 注目条件（いずれかを満たす）

1. **出来高急増**: 出来高比率 > 2.0（20日平均の2倍以上）
2. **テクニカル変化**: チャートパターンが新たに検出された
3. **大幅な値動き**: 日次変化率の絶対値 > 3%
4. **MA乖離拡大**: MA乖離率の絶対値 > 10%
5. **決算直前**: 決算発表まで7日以内
6. **セクタートレンド上位**: 所属セクターのcompositeScoreが上位3

### 除外条件

- 上場廃止銘柄
- データ取得失敗が3回以上

## 注目理由の種類（highlightType）

| タイプ | 説明 | 例 |
|--------|------|-----|
| `volume_spike` | 出来高急増 | 「出来高が20日平均の3.2倍に急増」 |
| `technical_change` | テクニカル変化 | 「ダブルボトムパターンが出現」 |
| `price_movement` | 大幅な値動き | 「前日比+5.2%の大幅上昇」 |
| `ma_divergence` | MA乖離拡大 | 「25日移動平均線から-12%乖離」 |
| `earnings_upcoming` | 決算直前 | 「決算発表まであと3日」 |
| `sector_trend` | セクタートレンド | 「半導体セクターが連続上昇中」 |

## スコアリング

スコアリングは「ユーザーの投資スタイルに合った銘柄か」で判断する。

スコアリングに含まれる要素:
- 投資スタイル別の重み（モメンタム、出来高、ボラティリティ、時価総額）
- セクタートレンド連続ボーナス
- セクター順位ボーナス

## セクターキャップ

スコア順にソートされた銘柄に対し、同一セクターから最大2銘柄までを候補に含める。

## AI出力スキーマ

```json
{
  "marketSignal": "bullish | neutral | bearish",
  "selections": [
    {
      "tickerCode": "銘柄コード",
      "highlightType": "volume_spike | technical_change | price_movement | ma_divergence | earnings_upcoming | sector_trend",
      "reason": "注目理由（客観的な事実ベース。売買推奨は含まない）"
    }
  ]
}
```

## 保有銘柄・ウォッチリスト銘柄の扱い

保有銘柄・ウォッチリスト銘柄も候補から除外しない。条件を満たせばデータ変化として表示する。

- 保有銘柄が候補に含まれる場合: 「保有中」バッジを表示
- ウォッチリスト銘柄が候補に含まれる場合: 「ウォッチ中」バッジを表示

※ 「買い増しチャンス」「買い時かも」等の売買を示唆するバッジは使用しない

## セッション別のフォーカス

| セッション | フォーカス | 時間軸 |
|-----------|----------|--------|
| morning | 前場の注目データ | 今日〜今週 |
| afternoon | 後場の注目データ | 今日の後場〜明日 |
| evening | 翌営業日の注目データ | 明日〜来週 |

## 手動再生成

ダッシュボードの「再生成」ボタンからユーザーが手動で再生成できる。

## AI設定

| モデル | Temperature | 出力形式 |
|--------|-------------|----------|
| GPT-4o-mini | 0.4 | JSON Schema |

## プロンプト設計原則

- **投資助言の禁止**: 売買の推奨を出力しない。「注目データ」として事実のみ
- **ハルシネーション防止**: 提供されたデータ以外を引用しない
- **初心者向け言語**: 専門用語 + 必ず解説を付与
- **エビデンス必須**: すべての注目理由に客観的データを引用

## API

| エンドポイント | 認証 | 説明 |
|---------------|------|------|
| `POST /api/highlights/generate-daily` | CRON_SECRET | 今日の注目データ生成 |
| `POST /api/highlights/regenerate` | セッション認証 | 手動再生成 |
| `GET /api/highlights` | セッション認証 | 今日の注目データ取得 |

## データモデル

### DailyHighlight（旧: UserDailyRecommendation）

| カラム | 型 | 説明 |
|--------|-----|------|
| id | String | PK |
| userId | String | FK → User |
| stockId | String | FK → Stock |
| date | DateTime @db.Date | 日付（JST基準） |
| position | Int | 表示順序 |
| highlightType | String | 注目理由の種類 |
| highlightReason | String | 注目理由テキスト（事実ベース） |
| session | String | セッション |
| createdAt | DateTime | 作成日時 |

ユニーク制約: (userId, date, position)

## 関連ファイル

- `app/api/highlights/generate-daily/route.ts`（旧: `app/api/recommendations/generate-daily/route.ts`）
- `app/api/highlights/regenerate/route.ts`（旧: `app/api/recommendations/regenerate/route.ts`）
- `app/api/highlights/route.ts`（旧: `app/api/featured-stocks/route.ts`）
- `lib/highlight-scoring.ts`（旧: `lib/recommendation-scoring.ts`）
- `lib/highlight-filter.ts`（旧: `lib/recommendation-buy-filter.ts`）
- `lib/prompts/daily-highlight-prompt.ts`（旧: `lib/prompts/daily-recommendation-prompt.ts`）
