# AIレポート 仕様書

## 概要

AIの推奨精度を可視化するレポート機能です。日次・週次でAIの成績を追跡し、改善点を提示します。

**ページパス**: `/ai-report`

## 画面構成

### 精度サマリー

3つの推奨カテゴリごとの成績:

| カテゴリ | 説明 |
|----------|------|
| おすすめ銘柄 | 日次おすすめ（UserDailyRecommendation） |
| 購入判断 | ウォッチリスト銘柄の買い/見送り判断 |
| 銘柄分析 | ポートフォリオ銘柄の売買分析 |

### 各カテゴリの指標

| 指標 | 説明 |
|------|------|
| 件数 | 対象期間の推奨件数 |
| 平均リターン | 7日後の平均リターン(%) |
| 成功率 | 成功基準を満たした割合(%) |
| プラス率 | リターンがプラスの割合(%) |
| 改善提案 | OpenAIによる改善点テキスト |

### 詳細データ

- ベスト/ワーストの推奨
- セクター別パフォーマンス
- 推奨結果の時系列データ

## API仕様

### `GET /api/reports/ai-accuracy`

AI精度レポートを取得。

**レスポンス**:
```json
{
  "date": "2026-02-22",
  "dailyRecommendation": {
    "count": 25,
    "avgReturn": 2.3,
    "successRate": 72.0,
    "plusRate": 68.0,
    "improvement": "セクター分散を改善すべき..."
  },
  "purchaseRecommendation": {
    "count": 15,
    "avgReturn": 1.8,
    "successRate": 80.0,
    "plusRate": 73.3,
    "improvement": "ボラティリティの高い銘柄で精度が低下..."
  },
  "stockAnalysis": {
    "count": 30,
    "avgReturn": -0.5,
    "successRate": 66.7,
    "plusRate": 53.3,
    "improvement": "短期予測の精度向上が必要..."
  },
  "details": { ... }
}
```

### `GET /api/reports/recommendation-outcomes`

推奨結果の詳細データを取得。

**クエリパラメータ**: `type`, `limit`, `offset`

## データモデル

### DailyAIReport

| カラム | 型 | 説明 |
|--------|-----|------|
| date | Date | レポート日付 |
| dailyRecommendation* | 各種指標 | おすすめ銘柄の精度 |
| purchaseRecommendation* | 各種指標 | 購入判断の精度 |
| stockAnalysis* | 各種指標 | 銘柄分析の精度 |
| details | Json? | 詳細データ |

### WeeklyAIReport

| カラム | 型 | 説明 |
|--------|-----|------|
| weekStart | Date | 対象週の開始日 |
| weekEnd | Date | 対象週の終了日 |
| 同上の指標群 | - | - |

## レポート生成スケジュール

| タイミング | レポート | 説明 |
|-----------|----------|------|
| 毎営業日 18:00 JST | DailyAIReport | 過去7日間のローリング集計 |
| 毎週 | WeeklyAIReport | 1週間の確定データ |

## 結果追跡

詳細は [recommendation-outcomes.md](recommendation-outcomes.md) を参照。

## 関連ファイル

- `app/ai-report/page.tsx` - レポートページ
- `app/api/reports/ai-accuracy/route.ts` - 精度レポート API
- `app/api/reports/recommendation-outcomes/route.ts` - 結果追跡 API
- `lib/outcome-utils.ts` - 結果追跡ユーティリティ
- `scripts/github-actions/generate_recommendation_report.py` - レポート生成スクリプト
- `scripts/github-actions/evaluate_recommendation_outcomes.py` - 結果評価スクリプト
