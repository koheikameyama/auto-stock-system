/**
 * ニュース取得・分析設定
 */

// ニュースソース設定
export const NEWS_SOURCES = {
  NEWSAPI: {
    BASE_URL: "https://newsapi.org/v2",
    MAX_RESULTS: 30,
    LANGUAGE: "ja",
    SORT_BY: "publishedAt",
  },
  GOOGLE_RSS: {
    BASE_URL: "https://news.google.com/rss/search",
    MAX_RESULTS: 20,
  },
  YAHOO_FINANCE: {
    MAX_RESULTS: 10,
  },
} as const;

// 保持期間
export const NEWS_RETENTION = {
  ARTICLE_DAYS: 90,
  ANALYSIS_DAYS: 90,
} as const;

// 検索キーワード
export const NEWS_KEYWORDS = {
  GEOPOLITICAL: [
    "日銀 金利",
    "利上げ OR 利下げ",
    "円安 OR 円高 為替",
    "米中 関税 OR 制裁",
    "地政学 リスク",
    "FRB 金融政策",
  ],
  MARKET: [
    "日経平均 株式市場",
    "決算 上方修正 OR 下方修正",
    "IPO OR TOB OR M&A 日本",
  ],
  SECTOR: [
    "半導体 TSMC メモリ",
    "自動車 EV トヨタ",
    "銀行 金融 FinTech",
    "エネルギー 原油 電力",
  ],
} as const;

// Google RSSフィード設定
export const NEWS_RSS_FEEDS = {
  GEOPOLITICAL: [
    "日銀 金融政策 金利",
    "地政学 リスク 制裁 関税",
  ],
  MARKET: [
    "日本株式市場 日経平均",
    "決算 業績 上方修正",
  ],
  SECTOR: [
    "半導体 AI チップ",
    "自動車 EV 電動化",
    "銀行 金融 金利",
  ],
} as const;

// 同時実行数
export const NEWS_CONCURRENCY = {
  YAHOO_STOCK_NEWS: 5,
} as const;

// AI分析用の最大記事数
export const NEWS_AI_MAX_ARTICLES = 50;
