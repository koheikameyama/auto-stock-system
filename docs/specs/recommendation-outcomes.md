# 結果追跡 仕様書

> **⛔ 廃止**: この機能は廃止されました。売買推奨がなくなったため、推奨結果の追跡は不要になりました。関連テーブル（`RecommendationOutcome`）も廃止対象です。

## 概要（廃止）

~~すべてのAI推奨（日次おすすめ・購入判断・ポートフォリオ分析）の結果を追跡し、AI精度を検証する機能です。~~

## 追跡データ（RecommendationOutcome）

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

## 評価タイミング

毎営業日16:00 JST（市場終了後）

## 成功基準

| prediction | 成功条件 | 理由 |
|------------|----------|------|
| buy | リターン > -3% | 大損しなければ成功 |
| stay | リターン ≤ 5% | 見送って機会損失が小さい |
| remove | リターン < 3% | 除外した銘柄が大きく上がらない |
| up | リターン > -3% | 上昇方向の予測が概ね正しい |
| down | リターン < 3% | 下落方向の予測が概ね正しい |
| neutral | リターン ±5%以内 | 横ばい予測が正しい |

## API

| エンドポイント | 説明 |
|---------------|------|
| `POST /api/reports/recommendation-outcomes` | 結果追跡の評価実行 |
| `GET /api/reports/recommendation-outcomes` | 推奨結果の詳細データ取得（`type`, `limit`, `offset`） |

## 関連ファイル

- `app/api/reports/recommendation-outcomes/route.ts` - 結果追跡 API
- `lib/outcome-utils.ts` - 結果追跡ユーティリティ
- `scripts/github-actions/evaluate_recommendation_outcomes.py` - 結果評価スクリプト
