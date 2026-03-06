# Transaction Snapshot（購入時スナップショット）設計

## 背景

Stock Buddyは「学習ツール」としてのポジションだけでは継続利用の理由が弱い。「日常の投資パートナー」へシフトするために、ユーザーが自分の投資判断を振り返れる仕組みが必要。

## 目的

- **振り返り**: 「あのとき何を根拠に買ったか」を後から確認できる
- **比較**: 「購入時 vs 今」を並べて、状態がどう変化したか一目で分かる

## 要件

| 項目 | 決定事項 |
|------|---------|
| 保存内容 | スコア・ランク・株価・トレンド方向・AI分析コメント（中量） |
| 保存タイミング | 日次バッチで自動生成（購入登録日の分析完了後） |
| 対象 | 取引（buy/sell）のたびにスナップショット作成 |
| 表示場所 | 銘柄詳細ページ |
| 購入メモ | なし（将来追加可能） |
| 売却済み削除 | 全売却から90日後に自動削除 |

## データモデル

### TransactionSnapshot テーブル

```
TransactionSnapshot
├── id              String    PK, cuid
├── transactionId   String    FK → Transaction, unique (1:1)
├── stockPrice      Decimal   取引時点の株価
├── technicalScore  Int?      テクニカルスコア 0-100
├── fundamentalScore Int?     ファンダメンタルスコア 0-100
├── healthRank      String?   健全性ランク A-E
├── shortTermTrend  String?   短期トレンド up/neutral/down
├── midTermTrend    String?   中期トレンド up/neutral/down
├── longTermTrend   String?   長期トレンド up/neutral/down
├── marketSignal    String?   市場シグナル bullish/neutral/bearish
├── analysisSummary String?   AI分析コメント要約
├── createdAt       DateTime
└── updatedAt       DateTime
```

- Transactionと1:1リレーション（uniqueリレーション）
- 分析データがない場合はnull許容
- `analysisSummary`はStockReportの`reason`等から短くまとめたテキスト

## バッチ処理

### スナップショット生成バッチ

日次分析バッチの完了後に実行。

```
日次分析バッチ完了
  ↓
スナップショット生成バッチ
  ↓
① SELECT transactions WHERE snapshot未作成
  ↓
② 対象stockIdの最新StockReportを一括取得
  ↓
③ TransactionSnapshot を一括INSERT
```

### 売却済みクリーンアップ

既存の定期クリーンアップ処理に追加。

- 全売却から90日経過したTransactionSnapshotを削除

## 表示UI

### 銘柄詳細ページ

「購入時の状態」セクションを追加。取引ごとにカードで表示（新しい順）。

```
━━━ 購入時の状態 ━━━━━━━━━━━━━━━━━

▼ 2026-02-15 購入（100株 × ¥2,500）
┌─────────────────────────────────┐
│  購入時 → 現在                    │
│  株価    ¥2,500 → ¥2,800 (+12%)  │
│  テクニカル  72 → 65              │
│  ファンダ    80 → 82              │
│  健全性     B → B                │
│  トレンド   ↑↗→ → ↑→↘           │
│                                   │
│  購入時のAI分析:                   │
│  「短期的に上昇トレンド継続中...」   │
└─────────────────────────────────┘

▼ 2026-03-01 追加購入（50株 × ¥2,700）
┌─────────────────────────────────┐
│  ...同様のフォーマット...           │
└─────────────────────────────────┘
```

### 表示ルール

- 「購入時 → 現在」の比較を横並びで表示
- 変化率はプラスなら緑、マイナスなら赤
- スナップショット未生成（登録直後）の場合は「分析データ準備中」と表示
