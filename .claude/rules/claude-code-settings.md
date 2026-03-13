# Claude Code 設定管理ルール

## 設定ファイルの役割分担

### `.claude/settings.json` (Git管理対象)

**チーム共有設定のみ**

- hooks の設定
- プロジェクト全体で共有すべき設定

**含めてはいけないもの:**
- ❌ permissions（個人の環境依存）
- ❌ APIキー・トークン（セキュリティリスク）
- ❌ ローカルパスが含まれるコマンド
- ❌ 一時的な作業用コマンド

### `.claude/settings.local.json` (Git管理外)

**個人用設定**

- permissions の設定
- 個人の環境に依存する設定
- ローカルパスを含む設定

**このファイルは `.gitignore` に含まれており、リポジトリにコミットされません。**

## 設定追加時のルール

### Permissions を追加する場合

**必ず `.claude/settings.local.json` に追加してください。**

```json
{
  "permissions": {
    "allow": [
      "Bash(git add:*)",
      "Bash(git commit:*)",
      // 新しい permission をここに追加
    ]
  }
}
```

### Hooks を追加する場合

**`.claude/settings.json` に追加してください。**

```json
{
  "hooks": {
    "SessionStart": [
      // hooks をここに追加
    ]
  }
}
```

## チェックリスト

設定を追加する前に確認：

- [ ] 追加する設定は permissions か？ → `.claude/settings.local.json`
- [ ] 追加する設定は hooks か？ → `.claude/settings.json`
- [ ] APIキーやトークンが含まれていないか？
- [ ] ローカルパスが含まれていないか？
- [ ] 一時的な作業用コマンドではないか？

## 重要な注意事項

1. **セキュリティ**: APIキー・トークンは絶対に settings ファイルに含めない
2. **クリーンな状態を保つ**: 一時的なコマンド許可は作業完了後に削除する
3. **チーム共有**: `.claude/settings.json` はチーム全体に影響するため、慎重に編集する

## 誤って `.claude/settings.json` に permissions を追加してしまった場合

1. `.claude/settings.local.json` に permissions を移動
2. `.claude/settings.json` から permissions を削除
3. Git の変更を確認して、意図しない設定がコミットされないようにする
