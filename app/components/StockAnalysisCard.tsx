"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import AnalysisTimestamp from "./AnalysisTimestamp";
import {
  UPDATE_SCHEDULES,
  PORTFOLIO_RECOMMENDATION_CONFIG,
  MARKET_SIGNAL_CONFIG,
} from "@/lib/constants";
import InvestmentStyleTabs from "./InvestmentStyleTabs";

interface StockAnalysisCardProps {
  stockId: string;
  quantity?: number; // 保有数量（売却提案で使用）
  // 買いアラート関連（ウォッチリスト用）
  onBuyAlertClick?: (limitPrice: number | null) => void;
  currentTargetBuyPrice?: number | null;
  embedded?: boolean;
  onAnalysisDateLoaded?: (date: string | null) => void;
  // シミュレーション用
  isSimulation?: boolean;
  autoGenerate?: boolean;
  // AI推奨価格を個別利確・損切り設定に反映（ポートフォリオ用）
  onApplyAIPrices?: (params: { takeProfitPrice: number | null; stopLossPrice: number | null; averagePurchasePrice: number }) => void;
}

interface AnalysisData {
  // PortfolioStock
  lastAnalysis: string | null;
  marketSignal: string | null;
  suggestedSellPrice: number | null;
  suggestedSellPercent: number | null;
  sellReason: string | null;
  sellCondition: string | null;
  sellTiming?: string | null;
  sellTargetPrice?: number | null;
  averagePurchasePrice: number | null;
  stopLossRate: number | null;
  buyTiming?: string | null;
  targetReturnRate: number | null;
  userTargetPrice: number | null;
  userStopLossPrice: number | null;
  // StockAnalysis（価格帯予測）
  currentPrice: number | null;
  recommendation: string | null;
  advice: string | null;
  confidence: number | null;
  limitPrice: number | null;
  stopLossPrice: number | null;
  analyzedAt: string | null;
  shortTermTrend: string | null;
  shortTermPriceLow: number | null;
  shortTermPriceHigh: number | null;
  shortTermText: string | null;
  midTermTrend: string | null;
  midTermPriceLow: number | null;
  midTermPriceHigh: number | null;
  midTermText: string | null;
  longTermTrend: string | null;
  longTermPriceLow: number | null;
  longTermPriceHigh: number | null;
  longTermText: string | null;
  // 投資スタイル別分析
  styleAnalyses: Record<string, StyleAnalysisData> | null;
  // リスク管理率（スタイル別）
  suggestedExitRate?: number | null;
  suggestedSellTargetRate?: number | null;
}

interface StyleAnalysisData {
  recommendation: string;
  confidence: number;
  marketSignal: string;
  advice: string;
  reason?: string;
  caution?: string;
  buyCondition?: string | null;
  buyTiming?: string | null;
  dipTargetPrice?: number | null;
  holdCondition?: string | null;
  sellTiming?: string | null;
  sellTargetPrice?: number | null;
  shortTerm?: string;
  sellReason?: string | null;
  sellCondition?: string | null;
  suggestedSellPercent?: number | null;
  suggestedSellPrice?: number | null;
  suggestedStopLossPrice?: number | null;
  suggestedExitRate?: number | null;
  suggestedSellTargetRate?: number | null;
  correctionExplanation?: string | null;
  divergenceType?: string | null;
  divergenceLabel?: string | null;
  divergenceExplanation?: string | null;
}


export default function StockAnalysisCard({
  stockId,
  quantity,
  onBuyAlertClick,
  currentTargetBuyPrice,
  embedded = false,
  onAnalysisDateLoaded,
  isSimulation = false,
  autoGenerate = false,
  onApplyAIPrices,
}: StockAnalysisCardProps) {

  const tAC = useTranslations("stocks.analysisCard");

  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [noData, setNoData] = useState(false);
  const [error, setError] = useState("");
  const [userInvestmentStyle, setUserInvestmentStyle] = useState<string>("BALANCED");
  const [selectedStyle, setSelectedStyle] = useState<string>("BALANCED");

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      // シミュレーション → simulated-portfolio-analysis
      // ポートフォリオ（quantity有） → portfolio-analysis
      // ウォッチリスト（quantity無） → purchase-recommendation
      const endpoint = isSimulation
        ? `/api/stocks/${stockId}/simulated-portfolio-analysis`
        : quantity
          ? `/api/stocks/${stockId}/portfolio-analysis`
          : `/api/stocks/${stockId}/purchase-recommendation`;

      const response = await fetch(endpoint);

      if (response.ok) {
        const data = await response.json();
        setAnalysis(data);
        if (!data.lastAnalysis && !data.analyzedAt) {
          setNoData(true);
          onAnalysisDateLoaded?.(null);
          // 自動生成が有効な場合は即実行
          if (autoGenerate) {
            generateAnalysis();
          }
        } else {
          setNoData(false);
          onAnalysisDateLoaded?.(data.analyzedAt || data.lastAnalysis);
          // シミュレーションモードで自動生成が有効な場合、既存データがあっても最新を生成
          if (isSimulation && autoGenerate) {
            generateAnalysis();
          }
        }
      } else if (response.status === 404) {
        setNoData(true);
        onAnalysisDateLoaded?.(null);
        if (autoGenerate) {
          generateAnalysis();
        }
      } else {
        setNoData(true);
        onAnalysisDateLoaded?.(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : tAC("error"));
    } finally {
      setLoading(false);
    }
  }

  async function generateAnalysis() {
    setLoading(false); // スケルトン表示を解除
    setGenerating(true);
    setError("");
    try {
      // ポートフォリオ用かウォッチリスト用か、あるいはシミュレーション用かで分岐
      let endpoint = quantity
        ? `/api/stocks/${stockId}/portfolio-analysis`
        : `/api/stocks/${stockId}/purchase-recommendation`;

      if (isSimulation) {
        endpoint = `/api/stocks/${stockId}/simulated-portfolio-analysis`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || tAC("generateFailed"));
      }

      // 結果を反映
      const data = await response.json();
      setAnalysis(data);
      setNoData(false);
      onAnalysisDateLoaded?.(data.analyzedAt || data.lastAnalysis);

      // シミュレーションでない場合のみ再取得（通常はPOSTで保存されているためGETで同期可能）
      if (!isSimulation) {
        await fetchData();
      }
    } catch (err) {
      console.error("Error generating analysis:", err);
      setError(err instanceof Error ? err.message : tAC("generateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    // ユーザーの投資スタイル設定を取得
    fetch("/api/settings")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.settings?.investmentStyle) {
          setUserInvestmentStyle(data.settings.investmentStyle);
          setSelectedStyle(data.settings.investmentStyle);
        }
      })
      .catch(() => {});

    if (isSimulation && autoGenerate) {
      // シミュレーションかつ自動分析の場合は、GETをスキップして直接生成
      generateAnalysis();
    } else {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockId]);

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "up":
        return "📈";
      case "down":
        return "📉";
      case "neutral":
        return "📊";
      default:
        return "📊";
    }
  };

  const getTrendText = (trend: string) => {
    switch (trend) {
      case "up":
        return tAC("trendUp");
      case "down":
        return tAC("trendDown");
      case "neutral":
        return tAC("trendNeutral");
      default:
        return tAC("trendUnknown");
    }
  };

  const getStatusBadge = (recommendation: string | null | undefined) => {
    if (!recommendation) return null;
    const config = PORTFOLIO_RECOMMENDATION_CONFIG[recommendation];
    if (!config) return null;

    return (
      <span
        className={`inline-block px-3 py-1 ${config.bg} ${config.color} rounded-full text-sm font-semibold`}
      >
        {config.text}
      </span>
    );
  };

  const getMarketSignalBadge = (signal: string | null | undefined) => {
    if (!signal) return null;
    const badge = MARKET_SIGNAL_CONFIG[signal];
    if (!badge) return null;

    return (
      <span
        className={`inline-flex items-center gap-0.5 px-2 py-0.5 ${badge.bg} ${badge.color} rounded-full text-xs font-medium`}
      >
        <span>{badge.icon}</span>
        <span>{badge.text}</span>
      </span>
    );
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString("ja-JP", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  // 分析中の場合
  if (generating) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-sm text-gray-600 mb-4">
          {isSimulation ? tAC("generatingPostPurchase") : tAC("aiAnalyzing")}
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-400 text-white text-sm font-medium rounded-lg cursor-not-allowed">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          {isSimulation ? tAC("generating") : tAC("analyzing")}
        </div>
      </div>
    );
  }

  // noDataはlastAnalysisがnullの場合にtrueになる
  // analysisのrecommendationがない場合は生成ボタンを表示
  if ((noData || error) && !analysis?.recommendation) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-sm text-gray-600 mb-4">
          {error || tAC("noDataYet")}
        </p>
        <button
          onClick={generateAnalysis}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            />
          </svg>
          {tAC("analyzeNow")}
        </button>
      </div>
    );
  }

  // 分析日時（より新しい方を表示）
  const analysisDate = analysis?.analyzedAt || analysis?.lastAnalysis;

  // 選択中のスタイルのデータを取得（スタイル別データがある場合はオーバーレイ）
  const styleData = analysis?.styleAnalyses?.[selectedStyle] ?? null;
  const isUserStyle = selectedStyle === userInvestmentStyle;
  const hasStyleAnalyses = analysis?.styleAnalyses && Object.keys(analysis.styleAnalyses).length > 0;

  // スタイル別データがある場合、分析データにマージ
  const effectiveAnalysis = analysis
    ? {
        ...analysis,
        ...(styleData && !isUserStyle
          ? {
              recommendation: styleData.recommendation,
              confidence: styleData.confidence,
              marketSignal: styleData.marketSignal,
              advice: styleData.advice,
              ...(styleData.sellReason !== undefined ? { sellReason: styleData.sellReason } : {}),
              ...(styleData.sellCondition !== undefined ? { sellCondition: styleData.sellCondition } : {}),
              ...(styleData.holdCondition !== undefined ? { holdCondition: styleData.holdCondition } : {}),
              ...(styleData.suggestedSellPercent !== undefined ? { suggestedSellPercent: styleData.suggestedSellPercent } : {}),
              ...(styleData.sellTiming !== undefined ? { sellTiming: styleData.sellTiming } : {}),
              ...(styleData.sellTargetPrice !== undefined ? { sellTargetPrice: styleData.sellTargetPrice } : {}),
              ...(styleData.buyTiming !== undefined ? { buyTiming: styleData.buyTiming } : {}),
              ...(styleData.suggestedSellPrice !== undefined
                ? { suggestedSellPrice: styleData.suggestedSellPrice, limitPrice: styleData.suggestedSellPrice }
                : {}),
              ...(styleData.suggestedStopLossPrice !== undefined
                ? { stopLossPrice: styleData.suggestedStopLossPrice }
                : {}),
              ...((styleData.suggestedExitRate ?? (styleData as any).suggestedStopLossRate) !== undefined
                ? { suggestedExitRate: styleData.suggestedExitRate ?? (styleData as any).suggestedStopLossRate }
                : {}),
              ...((styleData.suggestedSellTargetRate ?? (styleData as any).suggestedTakeProfitRate) !== undefined
                ? { suggestedSellTargetRate: styleData.suggestedSellTargetRate ?? (styleData as any).suggestedTakeProfitRate }
                : {}),
            }
          : {}),
        // ユーザースタイルの場合もstyleDataからrateを取得
        ...(styleData && isUserStyle
          ? {
              ...((styleData.suggestedExitRate ?? (styleData as any).suggestedStopLossRate) !== undefined
                ? { suggestedExitRate: styleData.suggestedExitRate ?? (styleData as any).suggestedStopLossRate }
                : {}),
              ...((styleData.suggestedSellTargetRate ?? (styleData as any).suggestedTakeProfitRate) !== undefined
                ? { suggestedSellTargetRate: styleData.suggestedSellTargetRate ?? (styleData as any).suggestedTakeProfitRate }
                : {}),
            }
          : {}),
      }
    : null;

  // セーフティルール補正の解説テキスト
  const correctionExplanation = styleData?.correctionExplanation ?? null;

  return (
    <div className="space-y-4">
      {/* シミュレーションバッジ */}
      {isSimulation && (
        <div className="bg-amber-100 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2">
          <span>🧪 {tAC("simulationBadge")}</span>
        </div>
      )}

      {/* 投資スタイル切り替えタブ */}
      {hasStyleAnalyses && (
        <InvestmentStyleTabs
          selectedStyle={selectedStyle}
          onSelectStyle={setSelectedStyle}
          userInvestmentStyle={userInvestmentStyle}
          styleResults={analysis?.styleAnalyses ?? undefined}
        />
      )}

      {/* ヘッダー */}
      <div className="flex items-center justify-between -mt-2 mb-2">
        <h3 className="text-base font-bold text-gray-800">
          {quantity || isSimulation ? tAC("aiTradeJudgment") : tAC("aiPricePrediction")}
        </h3>
        {!isSimulation && (
          <button
            onClick={generateAnalysis}
            disabled={generating}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                {tAC("analyzing")}
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>{tAC("refresh")}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* 撤退ラインアラート（ユーザーが撤退ラインを設定している場合のみ表示） */}
      {(() => {
        const currentPrice = effectiveAnalysis?.currentPrice;
        const avgPrice = effectiveAnalysis?.averagePurchasePrice;
        const stopLossRate = effectiveAnalysis?.stopLossRate;

        // 撤退ラインが未設定の場合は表示しない
        if (
          !currentPrice ||
          !avgPrice ||
          stopLossRate === null ||
          stopLossRate === undefined
        )
          return null;

        const changePercent = ((currentPrice - avgPrice) / avgPrice) * 100;
        const isStopLossReached = changePercent <= stopLossRate;

        if (!isStopLossReached) return null;

        return (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">⚠️</span>
              <p className="font-bold text-red-800">
                {tAC("stopLossReached", { percent: changePercent.toFixed(1) })}
              </p>
            </div>
            <div className="bg-white rounded-lg p-3 mb-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">{tAC("buyPrice")}</span>
                <span className="font-semibold">
                  {avgPrice.toLocaleString()}{tAC("yen")}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm mt-1">
                <span className="text-gray-600">{tAC("currentPrice")}</span>
                <span className="font-semibold text-red-600">
                  {currentPrice.toLocaleString()}{tAC("yen")}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm mt-1">
                <span className="text-gray-600">{tAC("stopLineSetting")}</span>
                <span className="font-semibold">{stopLossRate}%</span>
              </div>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-sm">
              <p className="font-semibold text-amber-800 mb-1">
                💡 {tAC("stopLossExplainTitle")}
              </p>
              <p className="text-amber-700">
                {tAC("stopLossExplainText")}
              </p>
            </div>
          </div>
        );
      })()}

      {/* AIアドバイス */}
      {effectiveAnalysis?.recommendation && (
        <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1.5">
              <p className="font-semibold text-gray-800">
                💡 {tAC("aiAdvice")}
              </p>
              {effectiveAnalysis.confidence !== null && (() => {
                const pct = Math.round(effectiveAnalysis.confidence * 100);
                return (
                  <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-bold ${pct >= 75 ? "bg-green-200 text-green-800" : pct >= 50 ? "bg-yellow-200 text-yellow-800" : "bg-gray-200 text-gray-700"}`}>
                    {tAC("confidence", { percent: pct })}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(effectiveAnalysis.recommendation)}
              {getMarketSignalBadge(effectiveAnalysis.marketSignal)}
            </div>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            {effectiveAnalysis.advice}
          </p>
          {/* セーフティルール補正の解説 */}
          {correctionExplanation && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-3">
              <p className="text-xs font-semibold text-indigo-700 mb-1">
                {tAC("safetyRuleCorrection")}
              </p>
              <p className="text-xs text-indigo-600 leading-relaxed">
                {correctionExplanation}
              </p>
            </div>
          )}
          {/* トレンド乖離の解説 */}
          {styleData?.divergenceExplanation && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
              <p className="text-xs font-semibold text-amber-700 mb-1">
                {tAC("trendTwistDetected")}
              </p>
              <p className="text-xs text-amber-600 leading-relaxed">
                {styleData.divergenceExplanation}
              </p>
            </div>
          )}
          {/* 指値・逆指値（推奨に応じて表示を切り替え） */}
          {(() => {
            // sell推奨時は「AI推奨価格」セクションを非表示（「売却検討」セクションに統合）
            if (effectiveAnalysis.recommendation === "sell") return null;

            // buy → 指値 + 撤退ライン、hold → 売却目標 + 撤退ライン
            const showLimitPrice =
              effectiveAnalysis.recommendation === "buy" ||
              effectiveAnalysis.recommendation === "hold";
            const showStopLossPrice = true; // buy/holdで撤退ラインを表示
            const hasPrice =
              (showLimitPrice && effectiveAnalysis.limitPrice) ||
              (showStopLossPrice && effectiveAnalysis.stopLossPrice);

            if (!hasPrice) return null;

            return (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                <p className="text-sm font-semibold text-gray-800 mb-2">
                  🎯 {tAC("aiRecommendedPrice")}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {showLimitPrice && effectiveAnalysis.limitPrice && (
                    <div>
                      {(() => {
                        const limitPriceNum = effectiveAnalysis.limitPrice;
                        const currentPrice = effectiveAnalysis.currentPrice;

                        // buy/hold共通: 売却目標として表示
                        // 含み損がある場合は「成行で売却OK」を表示しない（売却目標は含み益がある場合のみ目標到達と判定）
                        const avgPrice = effectiveAnalysis.averagePurchasePrice;
                        const hasLoss =
                          avgPrice && currentPrice && currentPrice < avgPrice;
                        const priceDiff = currentPrice
                          ? limitPriceNum - currentPrice
                          : 0;
                        const priceDiffPercent = currentPrice
                          ? ((priceDiff / currentPrice) * 100).toFixed(1)
                          : "0";

                        const isTargetReached =
                          !hasLoss && currentPrice && priceDiff <= 0;
                        const isNearTarget =
                          !hasLoss &&
                          currentPrice &&
                          !isTargetReached &&
                          Math.abs(priceDiff / currentPrice) < 0.01;

                        const takeProfitRate = effectiveAnalysis?.suggestedSellTargetRate;
                        const takeProfitPercent = takeProfitRate ? Math.round(takeProfitRate * 100) : null;

                        return (
                          <>
                            <p className="text-xs text-gray-500">{tAC("sellTarget")}</p>
                            <p className="text-base font-bold text-green-600">
                              {`${formatPrice(limitPriceNum)}${tAC("yen")}`}
                            </p>
                            {takeProfitPercent && (
                              <p className="text-xs text-gray-400">
                                {tAC("takeProfitPercent", { percent: takeProfitPercent })}
                              </p>
                            )}
                            {currentPrice &&
                              priceDiff > 0 &&
                              !isNearTarget && (
                                <p className="text-xs text-green-600">
                                  {tAC("remainToTarget", { amount: priceDiff.toLocaleString(), percent: priceDiffPercent })}
                                </p>
                              )}
                            {isNearTarget && (
                              <p className="text-xs text-green-600 font-semibold">
                                {tAC("nearTarget")}
                              </p>
                            )}
                            {isTargetReached && (
                              <p className="text-xs text-green-600 font-bold">
                                {tAC("targetReached")}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                  {showStopLossPrice && effectiveAnalysis.stopLossPrice && (
                    <div>
                      {(() => {
                        const stopLossPriceNum = effectiveAnalysis.stopLossPrice;
                        const currentPrice = effectiveAnalysis.currentPrice;
                        const priceDiff = currentPrice
                          ? stopLossPriceNum - currentPrice
                          : 0;
                        const priceDiffPercent = currentPrice
                          ? ((priceDiff / currentPrice) * 100).toFixed(1)
                          : "0";
                        const isNearStopLoss =
                          currentPrice &&
                          Math.abs(priceDiff / currentPrice) < 0.03; // 3%以内なら注意

                        const stopLossRate = effectiveAnalysis?.suggestedExitRate;
                        const stopLossRatePercent = stopLossRate ? Math.round(stopLossRate * 100) : null;

                        return (
                          <>
                            <p className="text-xs text-gray-500">
                              {tAC("stopLossLine")}
                            </p>
                            <p className="text-base font-bold text-red-600">
                              {formatPrice(stopLossPriceNum)}{tAC("yen")}
                            </p>
                            {stopLossRatePercent && (
                              <p className="text-xs text-gray-400">
                                {tAC("stopLossPercent", { percent: stopLossRatePercent })}
                              </p>
                            )}
                            {currentPrice && priceDiff < 0 && (
                              <p
                                className={`text-xs ${isNearStopLoss ? "text-red-600 font-semibold" : "text-gray-500"}`}
                              >
                                {isNearStopLoss ? "⚠️ " : ""}{tAC("remainToStopLoss", { amount: Math.abs(priceDiff).toLocaleString(), percent: Math.abs(Number(priceDiffPercent)) })}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
                {onApplyAIPrices && effectiveAnalysis.averagePurchasePrice && (
                  <button
                    onClick={() => onApplyAIPrices({
                      takeProfitPrice: effectiveAnalysis.limitPrice,
                      stopLossPrice: effectiveAnalysis.stopLossPrice,
                      averagePurchasePrice: effectiveAnalysis.averagePurchasePrice!,
                    })}
                    className="mt-3 w-full text-xs text-blue-600 hover:text-blue-800 font-semibold py-1.5 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {tAC("applyAIPrices")}
                  </button>
                )}
              </div>
            );
          })()}
          {/* 買い推奨（好調時） */}
          {effectiveAnalysis.recommendation === "buy" && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1">
                  📈 {tAC("buyRecommendation")}
                </p>
                <p className="text-sm text-gray-700">
                  {effectiveAnalysis.buyTiming === "dip"
                    ? tAC("buyDipText")
                    : tAC("buyStrongText")}
                </p>
              </div>
            )}
          {/* ホールド（様子見） */}
          {effectiveAnalysis.recommendation === "hold" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
              <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1">
                👀 {tAC("holdRecommendation")}
              </p>
              <p className="text-sm text-gray-700">
                {effectiveAnalysis.holdCondition || tAC("holdDefaultText")}
              </p>
            </div>
          )}
          {/* 売却検討 */}
          {effectiveAnalysis.recommendation === "sell" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
              <p className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1">
                ⚠️ {tAC("sellConsideration")}
              </p>
              <div className="space-y-2">
                {effectiveAnalysis.suggestedSellPercent && (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{tAC("recommendedSell")}</span>
                      <span
                        className={`font-bold ${
                          effectiveAnalysis.suggestedSellPercent === 100
                            ? "text-red-600"
                            : "text-amber-600"
                        }`}
                      >
                        {effectiveAnalysis.suggestedSellPercent}%
                      </span>
                    </div>
                    {quantity && quantity > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {tAC("sharesCount", { total: quantity, sell: Math.round((quantity * effectiveAnalysis.suggestedSellPercent) / 100) })}
                      </p>
                    )}
                  </div>
                )}
                {effectiveAnalysis.recommendation === "sell" ? (
                  effectiveAnalysis.sellTiming === "rebound" ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{tAC("sellMethod")}</span>
                        <span className="font-bold text-amber-600">
                          {tAC("reboundSellRecommended")}
                        </span>
                      </div>
                      {effectiveAnalysis.sellTargetPrice ? (
                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-amber-700">
                              {tAC("reboundTarget")}
                            </span>
                            <span className="text-base font-bold text-amber-800">
                              {effectiveAnalysis.sellTargetPrice.toLocaleString()}{tAC("yen")}
                            </span>
                          </div>
                          {effectiveAnalysis.currentPrice && (
                            <p className="text-xs text-amber-600 mt-1">
                              {tAC("priceFromCurrent", {
                                diff: effectiveAnalysis.sellTargetPrice > effectiveAnalysis.currentPrice
                                  ? `+${(effectiveAnalysis.sellTargetPrice - effectiveAnalysis.currentPrice).toLocaleString()}${tAC("yen")}（+${(((effectiveAnalysis.sellTargetPrice - effectiveAnalysis.currentPrice) / effectiveAnalysis.currentPrice) * 100).toFixed(1)}%）`
                                  : `${(effectiveAnalysis.sellTargetPrice - effectiveAnalysis.currentPrice).toLocaleString()}${tAC("yen")}（${(((effectiveAnalysis.sellTargetPrice - effectiveAnalysis.currentPrice) / effectiveAnalysis.currentPrice) * 100).toFixed(1)}%）`
                              })}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-yellow-800 mt-1">
                          {tAC("reboundOversoldText")}
                        </p>
                      )}
                      <p className="text-xs text-yellow-600 mt-1">
                        {tAC("reboundExplain")}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{tAC("sellMethod")}</span>
                        <span className="font-bold text-red-600">
                          {tAC("marketSellConsider")}
                        </span>
                      </div>
                      {effectiveAnalysis.suggestedSellPrice && effectiveAnalysis.averagePurchasePrice && effectiveAnalysis.suggestedSellPrice > effectiveAnalysis.averagePurchasePrice ? (
                        <p className="text-xs text-blue-600 mt-0.5">
                          💡 {tAC("limitOrderProfit", { price: effectiveAnalysis.suggestedSellPrice.toLocaleString(), diff: (effectiveAnalysis.suggestedSellPrice - effectiveAnalysis.averagePurchasePrice).toLocaleString(), percent: ((effectiveAnalysis.suggestedSellPrice - effectiveAnalysis.averagePurchasePrice) / effectiveAnalysis.averagePurchasePrice * 100).toFixed(1) })}
                        </p>
                      ) : effectiveAnalysis.currentPrice ? (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {tAC("currentPriceLabel", { price: effectiveAnalysis.currentPrice.toLocaleString() })}
                        </p>
                      ) : null}
                    </div>
                  )
                ) : (
                  effectiveAnalysis.suggestedSellPrice && (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{tAC("sellPriceLabel")}</span>
                        <span className="font-bold text-gray-800">
                          {effectiveAnalysis.suggestedSellPrice.toLocaleString()}{tAC("yen")}
                        </span>
                      </div>
                      {effectiveAnalysis.currentPrice && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {tAC("currentPriceLabel", { price: effectiveAnalysis.currentPrice.toLocaleString() })}
                        </p>
                      )}
                    </div>
                  )
                )}
                {effectiveAnalysis.sellReason && (
                  <div className="mt-2 p-2 bg-white rounded border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">{tAC("reasonLabel")}</p>
                    <p className="text-sm text-gray-700">
                      {effectiveAnalysis.sellReason}
                    </p>
                  </div>
                )}
                {effectiveAnalysis.sellCondition && (
                  <div className="text-xs text-gray-500 mt-1">
                    💡 {effectiveAnalysis.sellCondition}
                  </div>
                )}
                {onApplyAIPrices && effectiveAnalysis.averagePurchasePrice && (
                  (() => {
                    // rebound → sellTargetPrice
                    // 即時売却 → suggestedSellPrice（AIの推奨売却価格）
                    // それ以外 → suggestedSellPrice
                    const sellPrice = effectiveAnalysis.sellTiming === "rebound"
                      ? effectiveAnalysis.sellTargetPrice
                      : effectiveAnalysis.suggestedSellPrice;
                    if (!sellPrice && !effectiveAnalysis.stopLossPrice) return null;
                    return (
                      <button
                        onClick={() => onApplyAIPrices({
                          takeProfitPrice: sellPrice ?? null,
                          stopLossPrice: effectiveAnalysis.stopLossPrice,
                          averagePurchasePrice: effectiveAnalysis.averagePurchasePrice!,
                        })}
                        className="mt-3 w-full text-xs text-blue-600 hover:text-blue-800 font-semibold py-1.5 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {tAC("applyAIPrices")}
                      </button>
                    );
                  })()
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* 価格帯予測 */}
      {analysis?.shortTermTrend && (
        <>
          {/* 短期予測 */}
          <div className={`bg-gradient-to-br ${styleData?.divergenceLabel ? "from-amber-50 to-orange-50" : "from-purple-50 to-indigo-50"} rounded-lg shadow-md p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">
                {styleData?.divergenceLabel ? "⚡" : getTrendIcon(analysis.shortTermTrend)}
              </span>
              <div className="flex-1">
                <h4 className={`text-sm font-bold ${styleData?.divergenceLabel ? "text-amber-800" : "text-purple-800"}`}>
                  {tAC("shortTermPrediction")}
                </h4>
                <p className={`text-xs ${styleData?.divergenceLabel ? "text-amber-600" : "text-purple-600"}`}>
                  {styleData?.divergenceLabel || getTrendText(analysis.shortTermTrend)}{" "}
                  {analysis.shortTermPriceLow &&
                    analysis.shortTermPriceHigh &&
                    `¥${formatPrice(analysis.shortTermPriceLow)}〜¥${formatPrice(analysis.shortTermPriceHigh)}`}
                </p>
              </div>
            </div>
            {analysis.shortTermText && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {analysis.shortTermText}
              </p>
            )}
          </div>

          {/* 中期予測 */}
          {analysis.midTermTrend && (
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg shadow-md p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">
                  {getTrendIcon(analysis.midTermTrend)}
                </span>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-blue-800">
                    {tAC("midTermPrediction")}
                  </h4>
                  <p className="text-xs text-blue-600">
                    {getTrendText(analysis.midTermTrend)}{" "}
                    {analysis.midTermPriceLow &&
                      analysis.midTermPriceHigh &&
                      `¥${formatPrice(analysis.midTermPriceLow)}〜¥${formatPrice(analysis.midTermPriceHigh)}`}
                  </p>
                </div>
              </div>
              {analysis.midTermText && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {analysis.midTermText}
                </p>
              )}
            </div>
          )}

          {/* 長期予測 */}
          {analysis.longTermTrend && (
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg shadow-md p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xl">
                  {getTrendIcon(analysis.longTermTrend)}
                </span>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-emerald-800">
                    {tAC("longTermPrediction")}
                  </h4>
                  <p className="text-xs text-emerald-600">
                    {getTrendText(analysis.longTermTrend)}{" "}
                    {analysis.longTermPriceLow &&
                      analysis.longTermPriceHigh &&
                      `¥${formatPrice(analysis.longTermPriceLow)}〜¥${formatPrice(analysis.longTermPriceHigh)}`}
                  </p>
                </div>
              </div>
              {analysis.longTermText && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {analysis.longTermText}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* 分析日時・更新スケジュール */}
      <div className="text-center space-y-1">
        {analysisDate && <AnalysisTimestamp dateString={analysisDate} />}
        <p className="text-xs text-gray-400">
          {tAC("updateSchedule", { schedule: UPDATE_SCHEDULES.STOCK_ANALYSIS })}
        </p>
      </div>

      <p className="text-xs text-gray-500 text-center">
        {tAC("disclaimer")}
      </p>
    </div>
  );
}
