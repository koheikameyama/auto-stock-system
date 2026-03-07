/**
 * AI意思決定モジュール
 *
 * OpenAI GPT-4o を使用して市場評価・銘柄選定・売買判断を行う
 */

import { getOpenAIClient } from "../lib/openai";
import { OPENAI_CONFIG, UNIT_SHARES } from "../lib/constants";
import {
  MARKET_ASSESSMENT_SYSTEM_PROMPT,
  MARKET_ASSESSMENT_SCHEMA,
} from "../prompts/market-assessment";
import {
  STOCK_SELECTION_SYSTEM_PROMPT,
  STOCK_SELECTION_SCHEMA,
} from "../prompts/stock-selection";
import {
  TRADE_DECISION_SYSTEM_PROMPT,
  TRADE_DECISION_SCHEMA,
} from "../prompts/trade-decision";

// ========================================
// 入力型
// ========================================

export interface MarketDataInput {
  nikkeiPrice: number;
  nikkeiChange: number;
  sp500Change: number;
  vix: number;
  usdJpy: number;
  cmeFuturesPrice: number;
  cmeFuturesChange: number;
  newsSummary?: string;
}

export interface StockCandidateInput {
  tickerCode: string;
  name: string;
  technicalSummary: string; // formatTechnicalForAI の出力
  newsContext?: string;
}

export interface TradeInput {
  tickerCode: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  changePercent: number;
  sector: string;
  technicalSummary: string;
  newsContext?: string;
}

export interface PositionInput {
  tickerCode: string;
  quantity: number;
  averagePrice: number;
  strategy: "day_trade" | "swing";
}

// ========================================
// 出力型
// ========================================

export interface MarketAssessmentResult {
  shouldTrade: boolean;
  sentiment: "bullish" | "neutral" | "bearish" | "crisis";
  reasoning: string;
}

export interface StockSelectionResult {
  tickerCode: string;
  strategy: "day_trade" | "swing";
  score: number;
  reasoning: string;
}

export interface TradeDecisionResult {
  action: "buy" | "skip";
  limitPrice: number | null;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  quantity: number;
  strategy: "day_trade" | "swing";
  reasoning: string;
}

// ========================================
// 1. 市場評価
// ========================================

export async function assessMarket(
  data: MarketDataInput,
): Promise<MarketAssessmentResult> {
  const openai = getOpenAIClient();

  let userPrompt = `以下の市場データに基づいて、今日の日本株取引を行うべきか評価してください。

【市場指標】
- 日経225: ${data.nikkeiPrice.toLocaleString()}円（前日比: ${data.nikkeiChange >= 0 ? "+" : ""}${data.nikkeiChange.toFixed(2)}%）
- S&P500 前日比: ${data.sp500Change >= 0 ? "+" : ""}${data.sp500Change.toFixed(2)}%
- VIX: ${data.vix.toFixed(2)}
- USD/JPY: ${data.usdJpy.toFixed(2)}
- CME日経先物: ${data.cmeFuturesPrice.toLocaleString()}円（前日比: ${data.cmeFuturesChange >= 0 ? "+" : ""}${data.cmeFuturesChange.toFixed(2)}%）`;

  if (data.newsSummary) {
    userPrompt += `\n\n${data.newsSummary}`;
  }

  const response = await openai.chat.completions.create({
    model: OPENAI_CONFIG.MODEL,
    temperature: OPENAI_CONFIG.TEMPERATURE,
    messages: [
      { role: "system", content: MARKET_ASSESSMENT_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: MARKET_ASSESSMENT_SCHEMA,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("[ai-decision] assessMarket: Empty response from OpenAI");
  }

  return JSON.parse(content) as MarketAssessmentResult;
}

// ========================================
// 2. 銘柄選定
// ========================================

export async function selectStocks(
  assessment: MarketAssessmentResult,
  candidates: StockCandidateInput[],
): Promise<StockSelectionResult[]> {
  const openai = getOpenAIClient();

  const candidatesText = candidates
    .map(
      (c) => `
【${c.tickerCode} ${c.name}】
${c.technicalSummary}${c.newsContext ? `\n【ニュース】\n${c.newsContext}` : ""}`,
    )
    .join("\n---\n");

  const userPrompt = `【市場評価】
- 取引判断: ${assessment.shouldTrade ? "取引推奨" : "取引見送り"}
- センチメント: ${assessment.sentiment}
- 理由: ${assessment.reasoning}

【候補銘柄一覧】
${candidatesText}

上記の銘柄から、今日取引すべき銘柄を選定してください。スコア50以上の銘柄のみ返してください。`;

  const response = await openai.chat.completions.create({
    model: OPENAI_CONFIG.MODEL,
    temperature: OPENAI_CONFIG.TEMPERATURE,
    messages: [
      { role: "system", content: STOCK_SELECTION_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: STOCK_SELECTION_SCHEMA,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("[ai-decision] selectStocks: Empty response from OpenAI");
  }

  const parsed = JSON.parse(content) as { stocks: StockSelectionResult[] };
  return parsed.stocks;
}

// ========================================
// 3. 売買判断
// ========================================

export async function decideTrade(
  stock: TradeInput,
  assessment: MarketAssessmentResult,
  availableBudget: number,
  currentPositions: PositionInput[],
): Promise<TradeDecisionResult> {
  const openai = getOpenAIClient();

  const maxSharesByBudget =
    Math.floor(availableBudget / (stock.price * UNIT_SHARES)) * UNIT_SHARES;

  const positionsText =
    currentPositions.length > 0
      ? currentPositions
          .map(
            (p) =>
              `  ${p.tickerCode}: ${p.quantity}株 @ ¥${p.averagePrice.toLocaleString()} (${p.strategy})`,
          )
          .join("\n")
      : "  なし";

  let userPrompt = `【銘柄情報】
- ティッカー: ${stock.tickerCode}（${stock.name}）
- セクター: ${stock.sector}
- 現在価格: ¥${stock.price.toLocaleString()}
- 始値: ¥${stock.open.toLocaleString()}、高値: ¥${stock.high.toLocaleString()}、安値: ¥${stock.low.toLocaleString()}
- 前日終値: ¥${stock.previousClose.toLocaleString()}
- 変化率: ${stock.changePercent >= 0 ? "+" : ""}${stock.changePercent.toFixed(2)}%

【テクニカル分析】
${stock.technicalSummary}

【市場評価】
- センチメント: ${assessment.sentiment}
- 理由: ${assessment.reasoning}

【ポートフォリオ状況】
- 利用可能予算: ¥${availableBudget.toLocaleString()}
- 予算内最大株数: ${maxSharesByBudget}株
- 現在のポジション:
${positionsText}

買い/見送りの判断と、買いの場合は指値・利確・損切り価格、株数（${UNIT_SHARES}株単位）を決定してください。`;

  if (stock.newsContext) {
    userPrompt += `\n\n【関連ニュース】\n${stock.newsContext}`;
  }

  const response = await openai.chat.completions.create({
    model: OPENAI_CONFIG.MODEL,
    temperature: OPENAI_CONFIG.TEMPERATURE,
    messages: [
      { role: "system", content: TRADE_DECISION_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: TRADE_DECISION_SCHEMA,
  });

  const content = response.choices[0].message.content;
  if (!content) {
    throw new Error("[ai-decision] decideTrade: Empty response from OpenAI");
  }

  return JSON.parse(content) as TradeDecisionResult;
}
