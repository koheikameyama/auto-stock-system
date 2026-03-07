# Stock Buddy

勝てる自動株式トレードツール。

## コンセプト

**コツコツ確実に、毎日勝つ**

70%以上の勝率を目指す自動株式トレードツール。大きな利益を狙うのではなく、数%の利確を積み重ねることで、確実な勝ちを毎日積み上げていく。

### トレード戦略

| 項目 | 方針 |
|------|------|
| **勝率目標** | 70%以上 |
| **利確** | 数%の小さな利益を確実に取る |
| **損切り** | ルールベースで素早く実行、損失を最小限に |
| **頻度** | デイトレード〜スイングトレード |

### コアバリュー

| 価値 | 説明 |
|------|------|
| **勝率重視** | 大勝ちではなく、高確率で勝てるエントリーを厳選 |
| **リスク管理** | 損切りライン自動設定、連敗時のポジション縮小 |
| **自動化** | エントリー・利確・損切りを自動判断・自動執行 |
| **継続的改善** | トレード結果を記録・分析し、戦略をチューニング |

### 設計思想

- 大きく勝つより、確実に勝つ
- 複数の指標が一致した場合のみエントリー（確度重視）
- 損切りは例外なく実行（感情を排除）
- 利確は欲張らず、目標達成で確実に利確
- バックテストで勝率70%以上を確認してから本番適用

## 技術スタック

- **Runtime**: Hono + Node.js, TypeScript
- **Database**: PostgreSQL (Prisma ORM)
- **AI**: OpenAI GPT-4
- **株価データ**: yfinance (Python), yahoo-finance2 (npm)
- **技術指標**: technicalindicators (npm)
- **インフラ**: Railway
- **スケジューラ**: cron-job.org / GitHub Actions

## セットアップ

### 1. 環境変数の設定

`.env.example`をコピーして`.env`を作成し、必要な値を設定します。

```bash
cp .env.example .env
```

### 2. データベースのセットアップ

PostgreSQLデータベースを用意し、接続URLを`.env`の`DATABASE_URL`に設定します。

### 3. 依存パッケージのインストール

```bash
# Node.js パッケージ
npm install

# Python パッケージ
pip install -r scripts/requirements.txt
```

### 4. Prisma マイグレーション

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 5. 初期データ投入

```bash
python scripts/init_data.py
```

### 6. 開発サーバーの起動

```bash
npm run dev
```

## デプロイ

`main` ブランチへのプッシュで Railway が自動デプロイします。マイグレーションもビルド時に自動実行されます。

## ライセンス

Private
