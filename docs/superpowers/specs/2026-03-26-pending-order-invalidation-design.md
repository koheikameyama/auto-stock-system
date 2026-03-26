# Pending注文の有効期限設定 + ブレイクアウト前提崩壊キャンセル

## 背景

ブレイクアウト戦略のpending買い注文に2つの問題がある:

1. **expiresAt未設定**: entry-executorで作成されるpending注文にexpiresAtが設定されておらず、DB上で無期限に残り得る（ブローカー側は当日限定だがDBステータスがpendingのまま残るゾンビ注文のリスク）
2. **前提崩壊時のキャンセル未実装**: 出来高が萎んだ・高値を割り込んだ（フェイクアウト）場合でもpending注文が生き残る。ブレイクアウトは「勢いに乗る」戦略であり、勢いが消えた注文は戦略と矛盾する

## 変更内容

### 1. expiresAt設定

**ファイル**: `src/core/breakout/entry-executor.ts`（`executeEntry`関数内）

`prisma.tradingOrder.create` の `data` に `expiresAt` を追加:

```typescript
expiresAt: dayjs().add(ORDER_EXPIRY.SWING_DAYS, "day").hour(15).minute(0).second(0).toDate(),
```

- `ORDER_EXPIRY.SWING_DAYS` = 5（既存定数を再利用）
- 既存の `expireOrders()`（position-monitor毎分 + EOD）が自動でキャンセル処理を行う
- 追加のキャンセル処理は不要

### 2. ブレイクアウト前提崩壊チェック

**新関数**: `invalidateStalePendingOrders()` を `src/core/breakout/entry-executor.ts` に追加

**呼び出し元**: `src/jobs/breakout-monitor.ts` の `main()` 内（`resizePendingOrders` の後、トリガー処理の前）

#### 無効化条件

pending買い注文（`strategy="breakout"`, `status="pending"`, `side="buy"`）に対して、以下の**いずれか**を満たしたらキャンセル:

| 条件 | 判定ロジック | 根拠 |
|------|------------|------|
| 出来高萎縮 | `surgeRatio < BREAKOUT.VOLUME_SURGE.COOL_DOWN_THRESHOLD (1.2)` | ブレイクアウトの勢いが消えた |
| 高値割り込み | `currentPrice <= high20`（entrySnapshot.trigger.high20） | ブレイクアウト失敗（フェイクアウト） |

#### データソース

- `surgeRatio`: scannerの `lastSurgeRatios` マップから取得
- `currentPrice`: breakout-monitorが取得済みの `quotes` 配列から取得
- `high20`: pending注文の `entrySnapshot.trigger.high20` から取得（注文作成時に保存済み）

#### 処理フロー

```
breakout-monitor.main()
  ├── スキャン実行（既存）
  ├── resizePendingOrders()（既存）
  ├── invalidateStalePendingOrders(quotes, scanner, brokerMode)  ← 追加
  └── トリガー処理（既存）
```

`invalidateStalePendingOrders` の処理:

1. `strategy="breakout"`, `status="pending"`, `side="buy"` の注文を取得（stock含む）
2. 各注文について:
   - `entrySnapshot.trigger.high20` を取得
   - `quotes` から現在価格を取得（取得できなければスキップ）
   - `scanner.getState().lastSurgeRatios` からsurgeRatioを取得（なければスキップ）
   - 条件判定 → キャンセル（ブローカー取消 + DBステータス更新 + Slack通知）

#### 定数

新しい定数は追加しない。既存の `BREAKOUT.VOLUME_SURGE.COOL_DOWN_THRESHOLD` (1.2) を再利用。

#### Slack通知

キャンセル時に理由を明示:
- `「出来高萎縮（サージ比率 0.8x < 1.2x）」`
- `「高値割り込み（¥1,200 <= 20日高値 ¥1,250）」`

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/core/breakout/entry-executor.ts` | expiresAt設定 + `invalidateStalePendingOrders` 関数追加 |
| `src/jobs/breakout-monitor.ts` | `invalidateStalePendingOrders` の呼び出し追加 |
| `src/lib/constants/jobs.ts` | 変更なし（既存定数を再利用） |
| `src/lib/constants/breakout.ts` | 変更なし（既存定数を再利用） |

## テスト方針

- `invalidateStalePendingOrders` のユニットテスト: 出来高萎縮・高値割り込み・両方OK・データなしの各ケース
- entry-executorのexpiresAt設定の確認
