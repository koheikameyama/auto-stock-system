"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

interface BacktestResult {
  asOfDate: string;
  priceAtRec: number;
  recommendation: "buy" | "stay" | "avoid" | null;
  confidence: number | null;
  reason: string | null;
  actualReturns: {
    after1Day: number | null;
    after7Days: number | null;
    after14Days: number | null;
  };
  successJudgment: boolean | null;
  note: string;
}

interface BacktestSectionProps {
  stockId: string;
}

function RecommendationBadge({ rec, t }: { rec: string | null; t: ReturnType<typeof useTranslations> }) {
  if (!rec) return null;
  const styles: Record<string, { bg: string; text: string }> = {
    buy: { bg: "bg-green-100", text: "text-green-800" },
    stay: { bg: "bg-yellow-100", text: "text-yellow-800" },
    avoid: { bg: "bg-red-100", text: "text-red-800" },
  };
  const style = styles[rec];
  if (!style) return null;
  const label = t(rec as "buy" | "stay" | "avoid");
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}
    >
      {label}
    </span>
  );
}

function ReturnCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-gray-400">-</span>;
  const isPos = value > 0;
  const isNeg = value < 0;
  return (
    <span
      className={`text-sm font-semibold ${isPos ? "text-green-600" : isNeg ? "text-red-600" : "text-gray-600"}`}
    >
      {isPos ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export default function BacktestSection({ stockId }: BacktestSectionProps) {
  const t = useTranslations("stocks.backtest");
  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  const today = new Date();
  const maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() - 1);
  const minDate = new Date(today);
  minDate.setFullYear(minDate.getFullYear() - 1);
  const maxDateStr = maxDate.toISOString().split("T")[0];
  const minDateStr = minDate.toISOString().split("T")[0];

  async function runBacktest() {
    if (!date) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/stocks/${stockId}/backtest-analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asOfDate: date }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t("error"));
      }
      const data: BacktestResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("error"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4">
      {/* Accordion Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">🔍</span>
          <span className="text-sm font-semibold text-gray-700">{t("title")}</span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Accordion Content */}
      {isOpen && (
        <div className="mt-2 p-4 bg-white border border-gray-200 rounded-xl space-y-4">
          <p className="text-xs text-gray-500">{t("subtitle")}</p>

          {/* Date Picker + Run Button */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("dateLabel")}
              </label>
              <input
                type="date"
                value={date}
                min={minDateStr}
                max={maxDateStr}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={runBacktest}
              disabled={!date || loading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                  {t("running")}
                </span>
              ) : (
                t("runButton")
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              {/* AI Prediction */}
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{t("aiPrediction")}</span>
                    <RecommendationBadge rec={result.recommendation} t={t} />
                  </div>
                  {result.confidence !== null && (
                    <span className="text-xs text-gray-500">
                      {t("confidence", { value: result.confidence })}
                    </span>
                  )}
                </div>
                {result.reason && (
                  <p className="text-xs text-gray-700">{result.reason}</p>
                )}
              </div>

              {/* Actual Returns */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">{t("actualReturns")}</p>
                <p className="text-xs text-gray-500 mb-3">
                  {t("basePrice", { price: result.priceAtRec.toLocaleString() })}
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{t("after1Day")}</p>
                    <ReturnCell value={result.actualReturns.after1Day} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{t("after7Days")}</p>
                    <ReturnCell value={result.actualReturns.after7Days} />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{t("after14Days")}</p>
                    <ReturnCell value={result.actualReturns.after14Days} />
                  </div>
                </div>
              </div>

              {/* Success Judgment */}
              {result.successJudgment !== null && (
                <div
                  className={`rounded-lg p-3 flex items-center gap-2 ${
                    result.successJudgment
                      ? "bg-green-50 border border-green-200"
                      : "bg-red-50 border border-red-200"
                  }`}
                >
                  <span className="text-base">{result.successJudgment ? "✓" : "✗"}</span>
                  <span
                    className={`text-sm font-semibold ${
                      result.successJudgment ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {result.successJudgment ? t("successLabel") : t("missLabel")}
                  </span>
                </div>
              )}

              {/* Note */}
              <div className="bg-amber-50 border-l-4 border-amber-400 p-2">
                <p className="text-xs text-amber-700">⚠️ {t("note")}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
