"use client"

import { useTranslations } from "next-intl"

interface TechnicalSignalBadgeProps {
  marketSignal: string
}

export default function TechnicalSignalBadge({ marketSignal }: TechnicalSignalBadgeProps) {
  const t = useTranslations("stocks.technicalSignal")

  if (marketSignal === "neutral" || (marketSignal !== "bullish" && marketSignal !== "bearish")) {
    return null
  }

  const isBullish = marketSignal === "bullish"

  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ml-1.5 ${
      isBullish ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
    }`}>
      {isBullish ? "▲" : "▼"} {t(marketSignal)}
    </span>
  )
}
