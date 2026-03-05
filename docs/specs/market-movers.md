# 市場ランキング 仕様書

## 概要

日次の株価上昇/下落ランキングとAIによる原因分析を表示します。

> **注意**: ランキングと原因分析は事実の整理であり、売買の推奨は含みません。

**ページパス**: `/market-movers`

## 画面構成

### 上昇ランキング（TOP5）

- 赤色テーマ（🔺）
- 日次変化率の高い順に5銘柄
- 銘柄名、証券コード、セクター、現在価格
- AI原因分析（展開可能）
- 関連ニュース（センチメントタグ付き）

### 下落ランキング（TOP5）

- 青色テーマ（🔻）
- 日次変化率の低い順に5銘柄
- 同上の表示項目

### アクション

- 「詳しく見る」→ 銘柄詳細ページ
- 「気になる」→ ウォッチリスト追加
- 「追跡」→ 追跡銘柄追加

## API仕様

### `GET /api/market-analysis/gainers-losers`

今日（または最新の）市場ランキングを取得。

**レスポンス**:
```json
{
  "gainers": [
    {
      "id": "xxx",
      "date": "2026-02-22",
      "type": "gainer",
      "position": 1,
      "changeRate": 8.5,
      "analysis": "決算発表で上方修正が...",
      "relatedNews": [
        { "title": "記事タイトル", "url": "...", "sentiment": "positive" }
      ],
      "stock": {
        "tickerCode": "7203.T",
        "name": "トヨタ自動車",
        "sector": "輸送用機器",
        "latestPrice": 2800
      }
    }
  ],
  "losers": [...],
  "date": "2026-02-22",
  "isToday": true
}
```

### `POST /api/market-analysis/gainers-losers`

ランキングとAI分析を生成（CRON経由）。

**認証**: CRON_SECRET

**処理フロー**:
1. 出来高10万株以上の銘柄から上昇/下落TOP5を取得
2. 各銘柄に対して並列（最大5並列）:
   a. 関連ニュース取得（3日分、5件）
   b. OpenAI で原因分析（構造化JSON出力）
3. `DailyMarketMover` テーブルに保存

## データモデル

### DailyMarketMover

| カラム | 型 | 説明 |
|--------|-----|------|
| date | Date | 日付 |
| stockId | String | 銘柄ID |
| type | String | gainer / loser |
| position | Int | 表示順序（1-5） |
| changeRate | Decimal | 前日比変化率(%) |
| analysis | Text | AI原因分析 |
| relatedNews | Json | 関連ニュース配列 |

**ユニーク制約**: `(date, type, position)`

## 生成スケジュール

- 毎営業日15:30 JST（市場終了後）に生成

## 関連ファイル

- `app/market-movers/page.tsx` - ページエントリ
- `app/market-movers/MarketMoversDetail.tsx` - ランキング表示コンポーネント
- `app/api/market-analysis/gainers-losers/route.ts` - API
- `lib/prompts/mover-analysis-prompt.ts` - AI分析プロンプト
