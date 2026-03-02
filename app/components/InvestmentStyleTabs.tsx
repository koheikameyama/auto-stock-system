"use client";

import { INVESTMENT_STYLE_CONFIG } from "@/lib/constants";
import { useTranslations } from "next-intl";

const STYLE_KEYS = ["CONSERVATIVE", "BALANCED", "AGGRESSIVE"] as const;

type RecommendationLabel = "buy" | "stay" | "hold" | "avoid" | "sell";

interface StyleResult {
  recommendation: RecommendationLabel | string;
  sellTiming?: string | null;
}

interface InvestmentStyleTabsProps {
  selectedStyle: string;
  onSelectStyle: (style: string) => void;
  userInvestmentStyle?: string;
  styleResults?: Record<string, StyleResult | undefined>;
  className?: string;
}

function getRecommendationColor(recommendation: string): string {
  if (recommendation === "buy") return "text-green-600";
  if (recommendation === "stay" || recommendation === "hold")
    return "text-yellow-600";
  return "text-red-600";
}

const RECOMMENDATION_LABELS: RecommendationLabel[] = [
  "buy",
  "stay",
  "hold",
  "avoid",
  "sell",
];

export default function InvestmentStyleTabs({
  selectedStyle,
  onSelectStyle,
  userInvestmentStyle,
  styleResults,
  className = "",
}: InvestmentStyleTabsProps) {
  const t = useTranslations("stocks.styleAnalysis");

  return (
    <div className={`flex gap-1 bg-gray-100 rounded-lg p-1 ${className}`}>
      {STYLE_KEYS.map((style) => {
        const config = INVESTMENT_STYLE_CONFIG[style];
        const isSelected = selectedStyle === style;
        const isDefault = userInvestmentStyle === style;
        const styleResult = styleResults?.[style];

        return (
          <button
            key={style}
            onClick={() => onSelectStyle(style)}
            className={`flex-1 flex flex-col items-center gap-0.5 px-1.5 py-1.5 rounded-md text-xs font-medium transition-all min-w-0 ${
              isSelected
                ? "bg-white shadow-sm text-gray-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="flex items-center gap-0.5">
              <span>{config.icon}</span>
              <span className="truncate leading-tight">
                <span className="hidden sm:inline">{config.text}</span>
                <span className="sm:hidden">{t(`tabs.${style}`)}</span>
              </span>
              {isDefault && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
              )}
            </span>
            {styleResult &&
              RECOMMENDATION_LABELS.includes(
                styleResult.recommendation as RecommendationLabel
              ) && (
                <span
                  className={`text-[10px] font-bold leading-none ${getRecommendationColor(styleResult.recommendation)}`}
                >
                  {t(`labels.${styleResult.recommendation}`)}
                </span>
              )}
          </button>
        );
      })}
    </div>
  );
}
