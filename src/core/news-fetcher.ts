/**
 * Google News RSS パーサー（日本市場ニュース取得）
 *
 * 以前の同名ファイルを簡略化して復活。
 * DB保存なし。市場予想ジョブの入力データとして使用。
 * /news ページでもリアルタイム取得に利用。
 */

import * as cheerio from "cheerio";
import crypto from "crypto";
import { prisma } from "../lib/prisma";

const RSS_BASE_URL = "https://news.google.com/rss/search";

/** デフォルトの検索クエリ */
const DEFAULT_QUERY = "日経平均 OR 東証 OR 日本株";

export interface NewsHeadline {
  title: string;
  pubDate: string;
  source: string;
  url: string;
  category: "geopolitical" | "sector" | "stock";
}

// カテゴリ自動判定（タイトルベース）
const GEO_KEYWORDS = [
  "金利", "日銀", "fed", "frb", "円安", "円高", "関税", "制裁",
  "地政学", "選挙", "政策", "中東", "戦争", "利上げ", "利下げ",
  "金融政策", "中央銀行", "トランプ",
];

const SECTOR_KEYWORDS = [
  "半導体", "自動車", "銀行", "エネルギー", "ai", "ev",
  "医薬品", "不動産", "商社", "通信", "原油", "電力",
];

function categorizeArticle(title: string): "geopolitical" | "sector" | "stock" {
  const lower = title.toLowerCase();
  if (GEO_KEYWORDS.some((k) => lower.includes(k))) return "geopolitical";
  if (SECTOR_KEYWORDS.some((k) => lower.includes(k))) return "sector";
  return "stock";
}

/**
 * Google News RSSから日本市場関連ニュースを取得
 *
 * @param maxItems 最大取得件数（デフォルト15）
 * @param query 検索クエリ（デフォルト: 日経平均 OR 東証 OR 日本株）
 */
export async function fetchMarketNews(
  maxItems = 15,
  query = DEFAULT_QUERY,
): Promise<NewsHeadline[]> {
  const url = `${RSS_BASE_URL}?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "StockBuddy/1.0" },
    });
    if (!response.ok) {
      console.warn(`[news-fetcher] HTTP ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    const headlines: NewsHeadline[] = [];
    $("item").each((i, el) => {
      if (i >= maxItems) return false;
      const title = $(el).find("title").text().trim();
      const pubDate = $(el).find("pubDate").text().trim();
      const source = $(el).find("source").text().trim();
      const link = $(el).find("link").text().trim();
      if (title) {
        headlines.push({
          title,
          pubDate,
          source,
          url: link,
          category: categorizeArticle(title),
        });
      }
    });

    console.log(`[news-fetcher] ${headlines.length}件のニュースを取得`);
    return headlines;
  } catch (error) {
    console.error("[news-fetcher] ニュース取得失敗:", error);
    return [];
  }
}

/**
 * 取得したニュースをDBに保存（contentHashで重複スキップ）
 */
export async function saveNewsToDb(headlines: NewsHeadline[]): Promise<number> {
  let saved = 0;
  for (const h of headlines) {
    const contentHash = crypto
      .createHash("sha256")
      .update(`${h.title}|${h.url}`)
      .digest("hex");

    try {
      await prisma.newsArticle.upsert({
        where: { contentHash },
        update: {},
        create: {
          source: "google_rss",
          title: h.title,
          url: h.url,
          publishedAt: h.pubDate ? new Date(h.pubDate) : new Date(),
          category: h.category,
          contentHash,
        },
      });
      saved++;
    } catch {
      // unique制約違反等は無視
    }
  }
  console.log(`[news-fetcher] ${saved}/${headlines.length}件をDBに保存`);
  return saved;
}

/**
 * DBから指定時間以内のニュースを取得
 */
export async function getNewsFromDb(hours: number): Promise<NewsHeadline[]> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const articles = await prisma.newsArticle.findMany({
    where: { publishedAt: { gte: since } },
    orderBy: { publishedAt: "desc" },
  });

  return articles.map((a) => ({
    title: a.title,
    pubDate: a.publishedAt.toISOString(),
    source: a.source,
    url: a.url,
    category: a.category as NewsHeadline["category"],
  }));
}
