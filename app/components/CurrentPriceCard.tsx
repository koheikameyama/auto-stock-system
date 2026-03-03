"use client"

import { ReactNode } from "react"
import { useTranslations } from "next-intl"

interface StockPrice {
  currentPrice: number
  change: number
  changePercent: number
  marketTime?: number | null
}

interface CurrentPriceCardProps {
  title?: string
  price: StockPrice | null
  loading: boolean
  fiftyTwoWeekHigh?: number | null
  fiftyTwoWeekLow?: number | null
  actions?: ReactNode
  bottomActions?: ReactNode
  isDelisted?: boolean
  isStale?: boolean
}

export default function CurrentPriceCard({
  title,
  price,
  loading,
  fiftyTwoWeekHigh,
  fiftyTwoWeekLow,
  actions,
  bottomActions,
  isDelisted = false,
  isStale = false,
}: CurrentPriceCardProps) {
  const t = useTranslations("stocks.currentPrice")
  const displayTitle = title ?? t("defaultTitle")
  return (
    <section className="bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6">
      <div className={`flex items-center justify-between mb-4 ${isStale && !price ? "hidden sm:flex" : ""}`}>
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
          {displayTitle}
        </h2>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>

      <div className="space-y-4">
        {loading ? (
          <p className="text-sm text-gray-400">{t("loading")}</p>
        ) : price ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {isDelisted ? t("finalPrice") : t("currentPrice")}
              </span>
              <div className="text-right">
                <p className={`text-2xl font-bold ${isDelisted ? "text-gray-400" : "text-gray-900"}`}>
                  ¥{price.currentPrice.toLocaleString()}
                </p>
                {!isDelisted && (
                  <p
                    className={`text-sm font-semibold ${
                      price.change >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {price.change >= 0 ? "+" : ""}
                    {price.changePercent.toFixed(2)}%
                  </p>
                )}
                {price.marketTime && (
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(price.marketTime * 1000).toLocaleString("ja-JP", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {t("asOf")}
                  </p>
                )}
              </div>
            </div>

            {(fiftyTwoWeekHigh || fiftyTwoWeekLow) && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t("fiftyTwoWeekRange")}</span>
                <span className="font-semibold text-gray-900">
                  ¥{(fiftyTwoWeekHigh || 0).toLocaleString()} / ¥
                  {(fiftyTwoWeekLow || 0).toLocaleString()}
                </span>
              </div>
            )}

            {bottomActions && (
              <div className="flex justify-end">{bottomActions}</div>
            )}
          </>
        ) : isStale ? (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-3">
            <p className="text-xs text-amber-800">
              {t("staleMessage")}<br />{t("staleDetail")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">{t("noPriceInfo")}</p>
        )}
      </div>
    </section>
  )
}
