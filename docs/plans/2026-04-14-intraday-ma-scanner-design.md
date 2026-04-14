# 日中MA押し目スキャナー 設計ドキュメント

**Goal:** 前場（9:00-11:30）に20日MAタッチをリアルタイム検知し、フォワードテストデータを蓄積してエッジを検証する

**背景:** 日足MAバックテスト（OOS PF=0.54）では日足終値エントリーの限界を確認。日中エントリーの効果を検証するため、分足データ不要の軽量フォワードテスト方式を採用。

---

## アーキテクチャ

```
8:00 AM  watchlist-builder（既存）
  + 20日MAレベルを各銘柄に計算・保存（追加）

9:00-11:30 前場（毎分）
  market-tick（既存）
    └─ position-monitor（既存）
    └─ intraday-ma-scanner（新規）

検知時:
  → IntraDayMaPullbackSignal テーブルに保存
  → Slack通知

EODバッチ（既存 end-of-day）:
  + closePrice を当日シグナルに補完（追加）
```

---

## シグナル検知ロジック

```
条件（毎分、前場のみ）:
1. 現在値が20日MA ± 2%以内（MAタッチ）
2. 現在値 > 前回ポーリング値（上昇中）
3. 同銘柄の当日シグナル未発生

記録内容:
- 検知時刻・銘柄・MA値・検知価格・仮想SL（ATR×1.0）
- 当日終値はEODバッチで後から補完
```

---

## データモデル

### WatchlistEntry（既存テーブルへの追加）

```prisma
ma20  Float?  // 20日移動平均（当日朝に計算）
```

### IntraDayMaPullbackSignal（新規テーブル）

```prisma
model IntraDayMaPullbackSignal {
  id            Int      @id @default(autoincrement())
  date          DateTime @db.Date
  tickerCode    String
  detectedAt    DateTime
  ma20          Float
  detectedPrice Float
  closePrice    Float?   // EODバッチで補完
  stopLossPrice Float    // ATR×1.0の仮想SL
  atr14         Float
  createdAt     DateTime @default(now())
}
```

---

## UI画面

**ページ:** `/intraday-ma-signals`
**APIエンドポイント:** `GET /api/intraday-ma-signals?from=&to=`

表示カラム: 日付・銘柄・検知時刻・MA20・検知値・終値・仮想PnL・仮想SL

仮想PnL計算:
- 勝ち: 終値 > 検知値 → (終値 - 検知値) / 検知値
- 負け: 終値 < 仮想SL → (仮想SL - 検知値) / 検知値（固定損失）
- 結果待ち: closePrice未入力（当日）

---

## 実装スコープ

1. DBマイグレーション（ma20追加・新テーブル）
2. watchlist-builderにMA20計算を追加
3. `intraday-ma-scanner.ts`（新規ジョブ）
4. worker.tsに前場タスクとして登録
5. EODバッチにclosePrice補完を追加
6. API: `GET /api/intraday-ma-signals`
7. UI: `/intraday-ma-signals` ページ
