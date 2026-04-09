/**
 * ニュース取得ジョブ
 *
 * Google News RSSからニュースを取得してDBに保存する軽量ジョブ。
 */

import { fetchMarketNews, saveNewsToDb } from "../core/news-fetcher";
import { prisma } from "../lib/prisma";

async function main(): Promise<void> {
  console.log("=== News Collect 開始 ===");
  const headlines = await fetchMarketNews(15);
  await saveNewsToDb(headlines);
  console.log("=== News Collect 完了 ===");
}

main()
  .catch((error) => {
    console.error("News Collect エラー:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
