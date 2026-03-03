"use client"

import { useTranslations } from "next-intl"
import { formatAnalysisTime } from "@/lib/analysis-time"

interface AnalysisTimestampProps {
  dateString: string
  className?: string
}

/**
 * 分析日時の表示コンポーネント
 * 時間帯ラベル（寄り前分析など）と鮮度（◯時間前）を表示
 */
export default function AnalysisTimestamp({ dateString, className = "" }: AnalysisTimestampProps) {
  const t = useTranslations("stocks.analysisTimestamp")
  const { label, relative, freshness, colorClass } = formatAnalysisTime(dateString)

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      <span className={colorClass}>{label}</span>
      <span className="text-gray-400">|</span>
      <span className={freshness === "stale" ? "text-orange-500" : "text-gray-500"}>
        {relative}
      </span>
      {freshness === "stale" && (
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-100 text-orange-600 text-[10px]" title={t("staleTooltip")}>
          !
        </span>
      )}
    </span>
  )
}
