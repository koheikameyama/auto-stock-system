import { getNikkei225Data, getTrendDescription } from "@/lib/market-index";
import { getPromptStyleLabel } from "@/lib/constants";

interface UserSettings {
  investmentStyle: string;
  investmentBudget: number | null;
}

interface StockContext {
  stockId: string;
  tickerCode: string;
  name: string;
  sector: string | null;
  currentPrice: number | null;
  type: "portfolio" | "watchlist" | "view";
  quantity?: number;
  averagePurchasePrice?: number;
  profit?: number;
  profitPercent?: number;
}

interface MarketData {
  currentPrice: number;
  weekChangeRate: number;
  trend: "up" | "down" | "neutral";
  isMarketCrash: boolean;
}

export interface StockPreloadedData {
  financials: {
    pbr: number | null;
    per: number | null;
    roe: number | null;
    operatingCF: number | null;
    freeCF: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    marketCap: number | null;
    dividendYield: number | null;
    isProfitable: boolean | null;
    profitTrend: string | null;
    revenueGrowth: number | null;
    netIncomeGrowth: number | null;
    eps: number | null;
    isDelisted: boolean;
  } | null;
  analysis: {
    shortTermTrend: string | null;
    shortTermText: string | null;
    shortTermPriceLow: number;
    shortTermPriceHigh: number;
    midTermTrend: string | null;
    midTermText: string | null;
    midTermPriceLow: number;
    midTermPriceHigh: number;
    longTermTrend: string | null;
    longTermText: string | null;
    longTermPriceLow: number;
    longTermPriceHigh: number;
    recommendation: string | null;
    advice: string | null;
    confidence: number | null;
    analyzedAt: Date;
    daysAgo: number;
  } | null;
  news: {
    title: string;
    content: string;
    url: string;
    sentiment: string | null;
    publishedAt: Date;
  }[];
  portfolioAnalysis: {
    shortTerm: string | null;
    mediumTerm: string | null;
    longTerm: string | null;
    suggestedSellPrice: number | null;
    suggestedSellPercent: number | null;
    sellCondition: string | null;
    sellReason: string | null;
    lastAnalysis: Date | null;
  } | null;
  purchaseRecommendation: {
    recommendation: string;
    confidence: number | null;
    reason: string | null;
    positives: string[] | null;
    concerns: string[] | null;
    buyCondition: string | null;
    personalizedReason: string | null;
    marketSignal: string | null;
    date: Date;
  } | null;
}

export async function buildChatSystemPrompt(
  userSettings: UserSettings | null,
  stockContext?: StockContext,
  preloadedData?: StockPreloadedData,
): Promise<string> {
  // 市場データを取得
  let marketData: MarketData | null = null;
  try {
    marketData = await getNikkei225Data();
  } catch {
    // 取得失敗しても続行
  }

  const sections: string[] = [];

  // ペルソナ
  sections.push(`あなたは投資初心者向けのAIコーチです。
専門用語は使わず、中学生でも分かる言葉で説明してください。
ユーザーの質問に答えるために、必要に応じてツールを使ってデータを取得してください。`);

  // 銘柄コンテキスト
  if (stockContext) {
    const typeLabel =
      stockContext.type === "portfolio"
        ? "保有中"
        : stockContext.type === "watchlist"
          ? "気になる（ウォッチリスト）"
          : "閲覧中";

    let stockInfo = `\n## 質問対象の銘柄
- 銘柄名: ${stockContext.name}
- 証券コード: ${stockContext.tickerCode}
- セクター: ${stockContext.sector ?? "不明"}
- 種別: ${typeLabel}`;

    if (stockContext.currentPrice) {
      stockInfo += `\n- 現在価格: ¥${stockContext.currentPrice.toLocaleString()}`;
    }

    if (stockContext.type === "portfolio" && stockContext.quantity) {
      stockInfo += `
- 保有株数: ${stockContext.quantity}株
- 平均取得単価: ${(stockContext.averagePurchasePrice ?? 0).toLocaleString()}円
- 評価損益: ${(stockContext.profit ?? 0) >= 0 ? "+" : ""}${(stockContext.profit ?? 0).toLocaleString()}円（${(stockContext.profitPercent ?? 0).toFixed(2)}%）`;
    }

    // 事前取得データの中で、実際に値が入っているかチェック
    const hasFinancials = !!preloadedData?.financials;
    const hasAnalysis = !!preloadedData?.analysis;

    if (!hasFinancials || !hasAnalysis) {
      // 一部のデータが欠けている場合はツール使用を案内
      stockInfo += `

この銘柄について質問されたら、不足しているデータを以下のツールを使って取得してください:
- getStockPrice: リアルタイム株価`;

      if (!hasFinancials) {
        stockInfo += `\n- getStockFinancials: 財務指標（PBR, PER, 配当利回りなど）`;
      }
      if (!hasAnalysis) {
        stockInfo += `\n- getStockAnalysis: 最新のAI売買分析とアドバイス`;
      }

      stockInfo += `\n- getRelatedNews: 関連ニュース（tickerCodes=["${stockContext.tickerCode.replace(".T", "")}"]${stockContext.sector ? `, sectors=["${stockContext.sector}"]` : ""}）`;

      if (stockContext.type === "portfolio") {
        stockInfo += `\n- getPortfolioAnalysis: 保有銘柄分析（stockId="${stockContext.stockId}"）`;
      } else {
        stockInfo += `\n- getPurchaseRecommendations: 購入推奨（stockIds=["${stockContext.stockId}"]）`;
      }
    }

    if (preloadedData) {
      stockInfo += `

以下の銘柄データのうち、値が入っているものはすでに取得済みです。これらのデータをもとに具体的に答えてください。データが空（null）であったり、より詳細な情報が必要な場合は、上記のツールを呼び出してください。`;
    }

    sections.push(stockInfo);
  }

  // 事前取得済み銘柄データ
  if (stockContext && preloadedData) {
    const dataLines: string[] = ["\n## 銘柄データ（事前取得済み）"];

    // 財務指標
    if (preloadedData.financials) {
      const f = preloadedData.financials;
      const finLines = ["\n### 財務指標"];
      if (f.pbr !== null)
        finLines.push(
          `- PBR（株価純資産倍率）: ${f.pbr.toFixed(2)}倍（目安: 1倍以下で割安）`,
        );
      if (f.per !== null)
        finLines.push(
          `- PER（株価収益率）: ${f.per.toFixed(1)}倍（目安: 15-20倍が標準）`,
        );
      if (f.roe !== null)
        finLines.push(
          `- ROE（自己資本利益率）: ${f.roe.toFixed(1)}%（10%以上で優秀）`,
        );
      if (f.dividendYield !== null)
        finLines.push(`- 配当利回り: ${f.dividendYield.toFixed(2)}%`);
      if (f.fiftyTwoWeekHigh !== null && f.fiftyTwoWeekLow !== null) {
        finLines.push(
          `- 52週高値/安値: ¥${f.fiftyTwoWeekHigh.toLocaleString()} / ¥${f.fiftyTwoWeekLow.toLocaleString()}`,
        );
      }
      if (f.isProfitable !== null) {
        const profitText = f.isProfitable ? "黒字" : "赤字";
        const trendMap: Record<string, string> = {
          increasing: "増益傾向",
          decreasing: "減益傾向",
          stable: "横ばい",
        };
        const trendText =
          f.profitTrend && trendMap[f.profitTrend]
            ? `（${trendMap[f.profitTrend]}）`
            : "";
        finLines.push(`- 業績: ${profitText}${trendText}`);
      }
      if (f.revenueGrowth !== null)
        finLines.push(
          `- 売上成長率: ${f.revenueGrowth >= 0 ? "+" : ""}${f.revenueGrowth.toFixed(1)}%`,
        );
      if (f.netIncomeGrowth !== null)
        finLines.push(
          `- 純利益成長率: ${f.netIncomeGrowth >= 0 ? "+" : ""}${f.netIncomeGrowth.toFixed(1)}%`,
        );
      if (f.isDelisted) finLines.push("- ⚠️ 上場廃止済み");
      dataLines.push(finLines.join("\n"));
    }

    // AI分析
    if (preloadedData.analysis) {
      const a = preloadedData.analysis;
      const trendLabel = (trend: string | null) =>
        trend === "up" ? "上昇" : trend === "down" ? "下落" : "横ばい";
      const freshnessText =
        a.daysAgo === 0
          ? "本日"
          : a.daysAgo <= 3
            ? `${a.daysAgo}日前`
            : a.daysAgo <= 7
              ? `${a.daysAgo}日前（やや古い）`
              : `${a.daysAgo}日前（古い）`;

      const anaLines = [`\n### AI分析（${freshnessText}）`];
      if (a.recommendation) {
        anaLines.push(
          `推奨: ${a.recommendation}${a.confidence ? `（信頼度: ${a.confidence}%）` : ""}`,
        );
      }
      anaLines.push(
        `- 短期見通し（1-3ヶ月）: ${trendLabel(a.shortTermTrend)} ¥${a.shortTermPriceLow.toLocaleString()}〜¥${a.shortTermPriceHigh.toLocaleString()}`,
      );
      if (a.shortTermText) anaLines.push(`  ${a.shortTermText}`);
      anaLines.push(
        `- 中期見通し（3-12ヶ月）: ${trendLabel(a.midTermTrend)} ¥${a.midTermPriceLow.toLocaleString()}〜¥${a.midTermPriceHigh.toLocaleString()}`,
      );
      if (a.midTermText) anaLines.push(`  ${a.midTermText}`);
      anaLines.push(
        `- 長期見通し（1年以上）: ${trendLabel(a.longTermTrend)} ¥${a.longTermPriceLow.toLocaleString()}〜¥${a.longTermPriceHigh.toLocaleString()}`,
      );
      if (a.longTermText) anaLines.push(`  ${a.longTermText}`);
      if (a.advice) anaLines.push(`アドバイス: ${a.advice}`);
      dataLines.push(anaLines.join("\n"));
    }

    // 最新ニュース
    if (preloadedData.news && preloadedData.news.length > 0) {
      const newsLines = ["\n### 最新ニュース"];
      preloadedData.news.forEach((n, i) => {
        const daysAgo = Math.floor(
          (Date.now() - new Date(n.publishedAt).getTime()) /
            (1000 * 60 * 60 * 24),
        );
        const sentimentLabel =
          n.sentiment === "positive"
            ? "ポジティブ"
            : n.sentiment === "negative"
              ? "ネガティブ"
              : "中立";
        newsLines.push(
          `${i + 1}. ${n.title}（${daysAgo === 0 ? "本日" : `${daysAgo}日前`}・${sentimentLabel}）`,
        );
        if (n.content) newsLines.push(`   ${n.content.substring(0, 150)}`);
        newsLines.push(`   ${n.url}`);
      });
      dataLines.push(newsLines.join("\n"));
    }

    // 保有銘柄分析（ポートフォリオの場合）
    if (preloadedData.portfolioAnalysis) {
      const pa = preloadedData.portfolioAnalysis;
      const paLines = ["\n### 保有銘柄分析"];
      if (pa.shortTerm) paLines.push(`- 短期展望: ${pa.shortTerm}`);
      if (pa.mediumTerm) paLines.push(`- 中期展望: ${pa.mediumTerm}`);
      if (pa.longTerm) paLines.push(`- 長期展望: ${pa.longTerm}`);
      if (pa.suggestedSellPrice) {
        paLines.push(
          `- 売却推奨価格: ¥${pa.suggestedSellPrice.toLocaleString()}${pa.suggestedSellPercent ? `（+${pa.suggestedSellPercent}%）` : ""}`,
        );
      }
      if (pa.sellCondition) paLines.push(`- 売却条件: ${pa.sellCondition}`);
      if (pa.sellReason) paLines.push(`- 売却理由: ${pa.sellReason}`);
      dataLines.push(paLines.join("\n"));
    }

    // 購入推奨（ウォッチリスト/閲覧中の場合）
    if (preloadedData.purchaseRecommendation) {
      const pr = preloadedData.purchaseRecommendation;
      const prLines = ["\n### 購入推奨"];
      prLines.push(
        `推奨: ${pr.recommendation}${pr.confidence ? `（信頼度: ${pr.confidence}%）` : ""}`,
      );
      if (pr.reason) prLines.push(`理由: ${pr.reason}`);
      if (pr.positives && pr.positives.length > 0) {
        prLines.push("ポジティブ:");
        pr.positives.forEach((p) => prLines.push(`  • ${p}`));
      }
      if (pr.concerns && pr.concerns.length > 0) {
        prLines.push("注意点:");
        pr.concerns.forEach((c) => prLines.push(`  • ${c}`));
      }
      if (pr.buyCondition) prLines.push(`買い条件: ${pr.buyCondition}`);
      if (pr.personalizedReason)
        prLines.push(`あなたに合う理由: ${pr.personalizedReason}`);
      if (pr.marketSignal) prLines.push(`市場シグナル: ${pr.marketSignal}`);
      dataLines.push(prLines.join("\n"));
    }

    sections.push(dataLines.join(""));
  }

  // 市場概況
  if (marketData) {
    let marketSection = `\n## 市場概況
- 日経平均: ${marketData.currentPrice.toLocaleString()}円
- 週間変化率: ${marketData.weekChangeRate >= 0 ? "+" : ""}${marketData.weekChangeRate.toFixed(1)}%
- トレンド: ${getTrendDescription(marketData.trend)}`;

    if (marketData.isMarketCrash) {
      marketSection +=
        "\n⚠️ 市場全体が急落中です。新規購入は慎重に判断してください。";
    }

    sections.push(marketSection);
  }

  // ユーザーの投資スタイル
  if (userSettings) {
    const styleText = getPromptStyleLabel(userSettings.investmentStyle);

    sections.push(`\n## ユーザーの投資スタイル
- 投資スタイル: ${styleText}${userSettings.investmentBudget ? `\n- 投資予算: ${userSettings.investmentBudget.toLocaleString()}円` : ""}`);
  }

  // 回答ルール
  sections.push(`\n## 回答のルール
1. 専門用語は使わず、「上がりそう」「下がりそう」「今が買い時かも」など分かりやすい言葉で
2. 断定的な表現は避け、「〜と考えられます」「〜の可能性があります」を使う
3. ユーザーの投資スタイルに合わせたアドバイスをする
4. 親しみやすく丁寧な「ですます調」で話す
5. 回答は簡潔に（300字以内を目安）
6. 具体的な数字を引用して説得力を持たせる
7. 分析データが古い（7日以上前）場合は再分析を促す
8. ニュースを参照した場合は、回答の最後に以下の形式で参考情報を追加する:

---
📰 参考にした情報:
• ニュースタイトル
  URL

9. 上場廃止情報がある場合は必ず言及する
10. 必要なデータだけをツールで取得する（すべてのツールを呼ぶ必要はない）`);

  return sections.join("\n");
}
