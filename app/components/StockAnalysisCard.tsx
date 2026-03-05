"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import AnalysisTimestamp from "./AnalysisTimestamp";
import {
  UPDATE_SCHEDULES,
  HEALTH_RANK_CONFIG,
  RISK_LEVEL_CONFIG,
  MARKET_SIGNAL_CONFIG,
} from "@/lib/constants";

interface StockAnalysisCardProps {
  stockId: string;
  quantity?: number;
  embedded?: boolean;
  onAnalysisDateLoaded?: (date: string | null) => void;
}

interface AnalysisData {
  // Common
  currentPrice: number | null;
  analyzedAt: string | null;
  lastAnalysis: string | null;
  advice: string | null;
  shortTermTrend: string | null;
  shortTermText: string | null;
  midTermTrend: string | null;
  midTermText: string | null;
  longTermTrend: string | null;
  longTermText: string | null;
  // Portfolio-specific
  averagePurchasePrice: number | null;
  stopLossRate: number | null;
  targetReturnRate: number | null;
  userTargetPrice: number | null;
  userStopLossPrice: number | null;
  riskLevel: string | null;
  riskFlags: unknown[] | null;
  // Report-specific (watchlist)
  healthRank: string | null;
  technicalScore: number | null;
  fundamentalScore: number | null;
  alerts: unknown[] | null;
  healthScore: number | null;
  reason: string | null;
  caution: string | null;
  positives: string | null;
  concerns: string | null;
  keyCondition: string | null;
  supportLevel: number | null;
  resistanceLevel: number | null;
  marketSignal: string | null;
}

export default function StockAnalysisCard({
  stockId,
  quantity,
  embedded = false,
  onAnalysisDateLoaded,
}: StockAnalysisCardProps) {

  const tAC = useTranslations("stocks.analysisCard");

  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [noData, setNoData] = useState(false);
  const [error, setError] = useState("");

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      // portfolio (quantity > 0) -> portfolio-analysis
      // watchlist (no quantity) -> report
      const endpoint = quantity
        ? `/api/stocks/${stockId}/portfolio-analysis`
        : `/api/stocks/${stockId}/report`;

      const response = await fetch(endpoint);

      if (response.ok) {
        const data = await response.json();
        setAnalysis(data);
        if (!data.lastAnalysis && !data.analyzedAt) {
          setNoData(true);
          onAnalysisDateLoaded?.(null);
        } else {
          setNoData(false);
          onAnalysisDateLoaded?.(data.analyzedAt || data.lastAnalysis);
        }
      } else if (response.status === 404) {
        setNoData(true);
        onAnalysisDateLoaded?.(null);
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
    setLoading(false);
    setGenerating(true);
    setError("");
    try {
      const endpoint = quantity
        ? `/api/stocks/${stockId}/portfolio-analysis`
        : `/api/stocks/${stockId}/report`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || tAC("generateFailed"));
      }

      const data = await response.json();
      setAnalysis(data);
      setNoData(false);
      onAnalysisDateLoaded?.(data.analyzedAt || data.lastAnalysis);

      await fetchData();
    } catch (err) {
      console.error("Error generating analysis:", err);
      setError(err instanceof Error ? err.message : tAC("generateFailed"));
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    fetchData();
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

  const getHealthBadge = () => {
    if (analysis?.healthRank) {
      const config = HEALTH_RANK_CONFIG[analysis.healthRank];
      if (config) return <span className={`inline-block px-3 py-1 ${config.bg} ${config.color} rounded-full text-sm font-semibold`}>{config.text}</span>;
    }
    if (analysis?.riskLevel) {
      const config = RISK_LEVEL_CONFIG[analysis.riskLevel];
      if (config) return <span className={`inline-block px-3 py-1 ${config.bg} ${config.color} rounded-full text-sm font-semibold`}>{config.text}</span>;
    }
    return null;
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

  if (generating) {
    return (
      <div className="bg-gray-50 rounded-lg p-6 text-center">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-sm text-gray-600 mb-4">
          {tAC("aiAnalyzing")}
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-400 text-white text-sm font-medium rounded-lg cursor-not-allowed">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          {tAC("analyzing")}
        </div>
      </div>
    );
  }

  if ((noData || error) && !analysis?.advice) {
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

  const analysisDate = analysis?.analyzedAt || analysis?.lastAnalysis;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between -mt-2 mb-2">
        <h3 className="text-base font-bold text-gray-800">
          {tAC("aiAnalysis")}
        </h3>
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
      </div>

      {/* Health/Risk badge + Market signal badge */}
      {(getHealthBadge() || getMarketSignalBadge(analysis?.marketSignal)) && (
        <div className="flex items-center gap-2">
          {getHealthBadge()}
          {getMarketSignalBadge(analysis?.marketSignal)}
        </div>
      )}

      {/* Score bars (watchlist: technicalScore + fundamentalScore) */}
      {!quantity && (analysis?.technicalScore !== null || analysis?.fundamentalScore !== null) && (
        <div className="bg-white rounded-lg shadow-md p-4 space-y-3">
          {analysis?.technicalScore !== null && analysis?.technicalScore !== undefined && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-600">{tAC("technicalScore")}</span>
                <span className="text-sm font-bold text-gray-800">{analysis.technicalScore}/100</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${analysis.technicalScore >= 70 ? "bg-green-500" : analysis.technicalScore >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(analysis.technicalScore, 100)}%` }}
                ></div>
              </div>
            </div>
          )}
          {analysis?.fundamentalScore !== null && analysis?.fundamentalScore !== undefined && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-600">{tAC("fundamentalScore")}</span>
                <span className="text-sm font-bold text-gray-800">{analysis.fundamentalScore}/100</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${analysis.fundamentalScore >= 70 ? "bg-green-500" : analysis.fundamentalScore >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${Math.min(analysis.fundamentalScore, 100)}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alerts */}
      {analysis?.alerts && Array.isArray(analysis.alerts) && analysis.alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm font-semibold text-amber-800 mb-2">
            {tAC("alerts")}
          </p>
          <ul className="space-y-1">
            {analysis.alerts.map((alert, i) => (
              <li key={i} className="text-sm text-amber-700 flex items-start gap-1">
                <span className="flex-shrink-0">⚠️</span>
                <span>{typeof alert === "string" ? alert : (alert as { message?: string })?.message || JSON.stringify(alert)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Advice */}
      {analysis?.advice && (
        <div className="bg-white rounded-lg shadow-md p-4 border-l-4 border-blue-500">
          <p className="font-semibold text-gray-800 mb-2">
            💡 {tAC("aiAdvice")}
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">
            {analysis.advice}
          </p>
        </div>
      )}

      {/* Stop loss alert (portfolio with stopLossRate) */}
      {(() => {
        const currentPrice = analysis?.currentPrice;
        const avgPrice = analysis?.averagePurchasePrice;
        const stopLossRate = analysis?.stopLossRate;

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

      {/* Trend analysis (short/mid/long) */}
      {analysis?.shortTermTrend && (
        <>
          {/* Short-term */}
          <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg shadow-md p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">
                {getTrendIcon(analysis.shortTermTrend)}
              </span>
              <div className="flex-1">
                <h4 className="text-sm font-bold text-purple-800">
                  {tAC("shortTermPrediction")}
                </h4>
                <p className="text-xs text-purple-600">
                  {getTrendText(analysis.shortTermTrend)}
                </p>
              </div>
            </div>
            {analysis.shortTermText && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {analysis.shortTermText}
              </p>
            )}
          </div>

          {/* Mid-term */}
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
                    {getTrendText(analysis.midTermTrend)}
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

          {/* Long-term */}
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
                    {getTrendText(analysis.longTermTrend)}
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

      {/* Key condition (watchlist) */}
      {!quantity && analysis?.keyCondition && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
          <p className="text-sm font-semibold text-indigo-800 mb-1">
            🔑 {tAC("keyCondition")}
          </p>
          <p className="text-sm text-indigo-700 leading-relaxed">
            {analysis.keyCondition}
          </p>
        </div>
      )}

      {/* Risk flags (portfolio) */}
      {quantity && analysis?.riskFlags && Array.isArray(analysis.riskFlags) && analysis.riskFlags.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm font-semibold text-red-800 mb-2">
            {tAC("riskFlags")}
          </p>
          <ul className="space-y-1">
            {analysis.riskFlags.map((flag, i) => (
              <li key={i} className="text-sm text-red-700 flex items-start gap-1">
                <span className="flex-shrink-0">🚩</span>
                <span>{typeof flag === "string" ? flag : (flag as { message?: string })?.message || JSON.stringify(flag)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Analysis timestamp + update schedule */}
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
