"use client"

import { toast } from "sonner"
import { useTranslations } from "next-intl"

interface CopyableTickerProps {
  tickerCode: string
  className?: string
}

// .Tを除いたティッカーコードを取得
function getCleanTicker(tickerCode: string): string {
  return tickerCode.replace(/\.T$/, "")
}

export default function CopyableTicker({ tickerCode, className = "" }: CopyableTickerProps) {
  const t = useTranslations("stocks.ticker")
  const cleanTicker = getCleanTicker(tickerCode)

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    try {
      await navigator.clipboard.writeText(cleanTicker)
      toast.success(t("copied", { ticker: cleanTicker }))
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  return (
    <span
      onClick={handleCopy}
      className={`cursor-pointer hover:text-blue-600 active:text-blue-700 transition-colors ${className}`}
      title={t("tapToCopy")}
    >
      {tickerCode}
    </span>
  )
}

// 銘柄名からティッカーをコピーするためのユーティリティ
// Note: This is a non-hook utility function, so it cannot use useTranslations.
// The strings here will be updated when copyTicker callers migrate to using hooks directly.
export function copyTicker(tickerCode: string) {
  const cleanTicker = getCleanTicker(tickerCode)
  navigator.clipboard.writeText(cleanTicker)
    .then(() => toast.success(`${cleanTicker} をコピーしました`))
    .catch(() => toast.error("コピーに失敗しました"))
}
