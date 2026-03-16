# データベース

## ローカル環境

```bash
# ローカルPostgreSQL
postgresql://kouheikameyama@localhost:5432/stock_buddy
```

## 本番環境

- Railway でホスト
- 接続情報は `.env` に記載（Gitにはコミットしない）
- 直接操作は避ける（デプロイフローに任せる）
- **Railway DB容量上限: 5GB**（Hobbyプラン）
