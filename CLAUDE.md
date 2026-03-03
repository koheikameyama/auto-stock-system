# Stock Buddy プロジェクト固有の設定

## プロダクトコンセプト

### サービス概要

**Stock Buddy** - 株式投資初心者向けのAI投資アシスタントサービス

**キャッチコピー**: 「任せて学んで、一緒に増やす」

AIに判断を任せながら、理由を理解できる投資。投資の知識がなくても、予算と期間を入れるだけでAIが最適な銘柄を提案。専門用語も解説付きで学びながら成長できる。

**デザインイメージ**:

- トーン: 親しみやすい、信頼感のある、落ち着いた
- カラー: 信頼・安定を表すブルー系ベース、成長・上昇を表すグリーンをアクセント
- イメージ: 初心者に寄り添うコーチ、一緒に成長するパートナー
- アイコン: 上昇チャート + 本（学習）を組み合わせたデザイン

### ターゲットユーザー

**投資初心者〜トレーダー志望 - 「学びながら成長したい」人**

- 投資に興味があり、これからトレードしていきたい
- 専門用語も含めて投資の知識を身につけたい
- 実践的なスキルを段階的に学びたい
- リスクを理解した上で自分で判断できるようになりたい

### コアバリュー

1. **寄り添う**
   - 「投資、始めたいけど怖い？大丈夫です。一緒に学びながら成長しましょう」
   - AIコーチが毎日優しく声をかける
   - 専門用語には必ず解説を添える

2. **学べる**
   - テクニカル分析（チャートパターン、RSI、MACDなど）を解説付きで提供
   - 「なぜこのシグナルが出ているのか」を理解できる
   - 使いながら投資の知識が自然と身につく

3. **シンプル**
   - 質問は最小限（予算と期間だけ）
   - 選択肢を増やして迷わせない
   - お任せ感を大切に

4. **安心**
   - シミュレーション機能で練習できる
   - 初心者向けスコアで優良銘柄を提案

### 設計思想

#### 基本原則: AIとルールの役割分担

**「危ない株は人間がルールで止め、チャンスの株はAIが見つける」**

- **AIの役割**: チャンス発見（おすすめ銘柄、買いシグナル、ポジティブな材料）
- **ルールの役割**: 危険な株の検出・警告（赤字、高ボラティリティ、急落など）

AIは「良い株を見つける」ことに集中し、「危ない株を止める」のはルールベースで行う。
これにより、AIの判断ミスによる損失リスクを軽減し、ユーザーに安心感を提供する。

**ルールベースの強制補正条件（買い推奨をstayに変更）:**

- 急騰銘柄（`weekChangeRate >= 30%`）
- 赤字 かつ 高ボラティリティ（`isProfitable === false` && `volatility > 50%`）

#### ❌ やってはいけないこと

- 専門用語を解説なしで使う（用語には必ず説明を添える）
- 選択肢を増やす（銘柄数、リスク許容度の詳細など）
- ユーザーに判断を委ねすぎる
- 複雑な機能を追加する

#### ✅ やるべきこと

- 専門用語＋分かりやすい解説をセットで提供（例:「ダブルボトム（2回底を打って反転する買いパターン）」）
- 自動で最適な提案をする（予算と期間から銘柄数を決定）
- テクニカル分析の結果を初心者が理解できる形で表示
- 迷わせない導線設計
- シンプルで分かりやすいUI

#### 初心者向けの定義

**初心者向け ≠ 難しい言葉や論理を避ける**

- ✅ 複雑な指標も入れつつ、わかりやすく提示する
- ✅ 専門用語を使い、その意味と評価を添える
- ✅ 使いながら自然と専門用語を覚えていける設計

**表示形式の例:**

```
シャープレシオ: 1.2
（リスクに対するリターンの効率。1以上で優秀）
→ あなたのポートフォリオは効率よくリターンを得ています
```

1. **指標名** - 専門用語そのまま
2. **解説** - その指標が何を意味するか
3. **評価** - 良い/普通/注意など
4. **アクション** - 次に何をすべきか

### 機能方針

#### オンボーディング

- 質問は2つだけ（予算・期間）
- 銘柄数は自動決定（初心者が迷わないように）
- 提案は3択（実際に購入/シミュレーション/ウォッチリスト）

#### AI提案ロジック

- 投資期間に応じた分散投資
  - 長期: 4-5銘柄（リスク分散重視）
  - 中期: 3-4銘柄（バランス）
  - 短期: 2-3銘柄（機動性重視）
- 予算内で購入可能な銘柄から高スコア順に選択
- 初心者向けスコアを重視

#### 制限設計

- ポートフォリオ: 最大100銘柄
- ウォッチリスト: 最大100銘柄
- 追跡銘柄: 最大10銘柄
- 制限値は `lib/constants.ts` で一元管理

### 銘柄管理の定数

**銘柄管理に関する制限値は `lib/constants.ts` で一元管理されています。**

#### 定数一覧

```typescript
import {
  MAX_PORTFOLIO_STOCKS,    // 100 - ポートフォリオ上限
  MAX_WATCHLIST_STOCKS,    // 100 - ウォッチリスト上限
  MAX_TRACKED_STOCKS,      // 10  - 追跡銘柄上限
} from "@/lib/constants"
```

#### 銘柄登録API

銘柄登録は `/api/user-stocks` で実装されています。

- **ポートフォリオ**: `POST /api/user-stocks` with `type: "portfolio"`
- **ウォッチリスト**: `POST /api/user-stocks` with `type: "watchlist"`
- **追跡銘柄**: `POST /api/tracked-stocks`

#### チェックリスト

制限値を変更する場合：
- [ ] `lib/constants.ts` の値を変更
- [ ] 関連するAPIやUIが正しく動作するか確認

## 技術ルール

**作業前に必ず `.claude/rules/` 配下の関連ルールを確認してください。**

- デプロイ・DB操作を行う前 → `deploy.md` / `database.md`
- GitHub Actionsを編集する前 → `github-actions.md`
- 日付を扱うコードを書く前 → `date-handling.md`
- フロントエンドのUI実装前 → `frontend.md`
- LLM API連携を実装する前 → `llm-api.md`
- コード全般を書く前 → `coding-standards.md`

### 仕様書の管理

**機能の追加・変更時は必ず `docs/specs/` の仕様書を更新してください。**

- **新機能追加時**: 該当する仕様書に機能を追記。新しい機能カテゴリの場合は仕様書ファイルを新規作成し、`main.md` の機能一覧にもリンクを追加
- **既存機能の変更時**: 該当する仕様書の記載内容を実装に合わせて更新
- **API追加・変更時**: エンドポイント、リクエスト/レスポンス仕様を更新
- **データモデル変更時**: 該当する仕様書のデータモデルセクションを更新
- **バッチ処理追加・変更時**: `batch-processing.md` のワークフロー一覧とデータフローを更新

| 仕様書 | 内容 |
|--------|------|
| [main.md](docs/specs/main.md) | メイン仕様書（サービス概要、技術スタック、データモデル概要、機能一覧） |
| [dashboard.md](docs/specs/dashboard.md) | ダッシュボード |
| [my-stocks.md](docs/specs/my-stocks.md) | マイ株（ポートフォリオ・ウォッチリスト・追跡・売却済み） |
| [portfolio-analysis.md](docs/specs/portfolio-analysis.md) | ポートフォリオ分析 |
| [stock-detail.md](docs/specs/stock-detail.md) | 銘柄詳細 |
| [daily-recommendations.md](docs/specs/daily-recommendations.md) | 日次おすすめ |
| [purchase-analysis.md](docs/specs/purchase-analysis.md) | 購入判断 |
| [market-movers.md](docs/specs/market-movers.md) | 市場ランキング |
| [news.md](docs/specs/news.md) | ニュース・セクタートレンド |
| [ai-report.md](docs/specs/ai-report.md) | AIレポート |
| [recommendation-outcomes.md](docs/specs/recommendation-outcomes.md) | 結果追跡 |
| [ai-chat.md](docs/specs/ai-chat.md) | AIチャット |
| [notifications.md](docs/specs/notifications.md) | 通知 |
| [settings.md](docs/specs/settings.md) | 設定・認証 |
| [batch-processing.md](docs/specs/batch-processing.md) | バッチ処理 |
| [admin.md](docs/specs/admin.md) | 管理画面 |

詳細は `.claude/rules/` 配下を参照してください。

### 記憶・ルールの保存

新しいパターンや規約を記憶する際も `.claude/rules/` を積極的に活用してください。

- **既存ファイルに関連する内容** → 対応する rules ファイルに追記
- **新しいトピック** → `.claude/rules/` に新規ファイルを作成し、上記の参照テーブルにも追加
- `memory/MEMORY.md` はプロジェクト横断的な記憶のみ（インフラ制約など）に絞る

| ファイル | 内容 |
|---|---|
| [deploy.md](.claude/rules/deploy.md) | デプロイフロー（Railway自動デプロイ） |
| [github-actions.md](.claude/rules/github-actions.md) | GitHub Actions（ジョブ設計、Pythonスクリプト、Slack通知） |
| [database.md](.claude/rules/database.md) | データベース接続情報 |
| [date-handling.md](.claude/rules/date-handling.md) | 日付・時刻の扱い（JST基準、dayjs） |
| [frontend.md](.claude/rules/frontend.md) | データ取得・スケルトン表示パターン |
| [llm-api.md](.claude/rules/llm-api.md) | LLM API連携（構造化出力） |
| [coding-standards.md](.claude/rules/coding-standards.md) | マジックナンバー、後方互換性、並列化、設計ファイル |
