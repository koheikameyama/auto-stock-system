# 設定・認証 仕様書

## 概要

ユーザーの投資設定、通知設定、アカウント管理機能です。

**ページパス**: `/settings`

## 設定項目

### 投資スタイル

| 選択肢 | 説明 |
|--------|------|
| CONSERVATIVE（安定配当型） | 配当と安定性を重視、割安な優良企業中心 |
| BALANCED（成長投資型） | 成長企業を割安なタイミングで狙う |
| AGGRESSIVE（アクティブ型） | モメンタム重視、短期で利益を狙う |

### 投資予算

プリセット: 10万円 / 30万円 / 50万円 / 100万円 + カスタム入力

「未定」も選択可能（nullable）。

### 目標利益率

プリセット: 5% / 10% / 15% / 20% / 30% + カスタム入力

### 損切りライン

プリセット: -5% / -10% / -15% / -20% + カスタム入力

### プッシュ通知

- ON/OFF トグル
- ブラウザのWeb Push API対応確認
- Service Worker登録

## API仕様

### `GET /api/settings`

ユーザー設定を取得。未設定の場合はデフォルト値を返却。

**レスポンス**:
```json
{
  "investmentStyle": "BALANCED",
  "investmentBudget": 300000,
  "targetReturnRate": 15,
  "stopLossRate": -10
}
```

### `PUT /api/settings`

設定を更新。

**リクエストボディ**:
```json
{
  "investmentStyle": "AGGRESSIVE",
  "investmentBudget": 500000,
  "targetReturnRate": 20,
  "stopLossRate": -15
}
```

**バリデーション**:
- investmentStyle: CONSERVATIVE / BALANCED / AGGRESSIVE のいずれか
- investmentBudget: 正の整数 or null
- targetReturnRate: 正の整数 or null
- stopLossRate: 負の整数 or null

## 認証

### NextAuth.js

- セッションベース認証
- プロバイダ: ソーシャルログイン

### ロール

| ロール | 説明 |
|--------|------|
| user | 一般ユーザー（デフォルト） |
| admin | 管理者 |

### 利用規約同意

初回ログイン時に利用規約とプライバシーポリシーへの同意が必要。

**API**: `POST /api/user/accept-terms`

同意後のフラグ:
- `User.termsAccepted` = true
- `User.privacyPolicyAccepted` = true

## バッジシステム（更新通知）

各セクションに新着コンテンツがあると赤いバッジを表示。

### `GET /api/badges`

**クエリパラメータ**: 各セクションの最終閲覧タイムスタンプ（ISO形式）

**レスポンス**:
```json
{
  "dashboard": true,
  "myStocks": false,
  "news": true,
  "portfolioAnalysis": false,
  "aiReport": true,
  "menu": true
}
```

**バッジ判定ロジック**:

| セクション | 条件 |
|-----------|------|
| dashboard | 最終閲覧以降に新しい UserDailyRecommendation |
| myStocks | 最終閲覧以降に新しい StockAnalysis |
| news | 最終閲覧以降に新しい MarketNews |
| portfolioAnalysis | PortfolioOverallAnalysis.analyzedAt が最終閲覧以降 |
| aiReport | 最終閲覧以降に新しい WeeklyAIReport |
| menu | portfolioAnalysis or aiReport が更新 |

## データモデル

### UserSettings

| カラム | 型 | 説明 |
|--------|-----|------|
| userId | String | ユーザーID（ユニーク） |
| investmentStyle | String | CONSERVATIVE / BALANCED / AGGRESSIVE |
| investmentBudget | Int? | 投資予算（円） |
| targetReturnRate | Int? | 目標利益率(%) |
| stopLossRate | Int? | 損切りライン(%) |

### User（認証関連カラム）

| カラム | 型 | 説明 |
|--------|-----|------|
| role | String | user / admin |
| termsAccepted | Boolean | 利用規約同意 |
| termsAcceptedAt | DateTime? | 同意日時 |
| privacyPolicyAccepted | Boolean | プライバシーポリシー同意 |
| privacyPolicyAcceptedAt | DateTime? | 同意日時 |
| subscriptionPlan | String | free / premium（将来用） |

## 関連ファイル

- `app/settings/page.tsx` - 設定ページ
- `app/api/settings/route.ts` - 設定 API
- `app/api/user/accept-terms/route.ts` - 利用規約同意 API
- `app/api/badges/route.ts` - バッジ API
- `app/login/` - ログインページ
- `app/terms-acceptance/` - 利用規約同意フロー
- `lib/auth-utils.ts` - 認証ユーティリティ
