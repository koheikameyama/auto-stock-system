"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useTranslations } from "next-intl"
import { getActionButtonClass, ACTION_BUTTON_LABELS } from "@/lib/ui-config"

interface StockActionButtonsProps {
  tickerCode: string
  redirectTo?: string
  showWatchlist?: boolean
  showTracked?: boolean
  showPurchase?: boolean
  onPurchaseClick?: () => void
  isInWatchlist?: boolean
  isTracked?: boolean
  investmentTheme?: string | null
  recommendationReason?: string | null
  onWatchlistSuccess?: () => void
  onTrackedSuccess?: (trackedStockId?: string) => void
}

export default function StockActionButtons({
  tickerCode,
  redirectTo,
  showWatchlist = true,
  showTracked = true,
  showPurchase = false,
  onPurchaseClick,
  isInWatchlist = false,
  isTracked = false,
  investmentTheme,
  recommendationReason,
  onWatchlistSuccess,
  onTrackedSuccess,
}: StockActionButtonsProps) {
  const router = useRouter()
  const t = useTranslations("stocks.actionButtons")
  const [addingToWatchlist, setAddingToWatchlist] = useState(false)
  const [addingToTracked, setAddingToTracked] = useState(false)

  const isDisabled = addingToWatchlist || addingToTracked

  const handleAddToWatchlist = async () => {
    setAddingToWatchlist(true)
    try {
      const response = await fetch("/api/user-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickerCode,
          type: "watchlist",
          ...(investmentTheme && { investmentTheme }),
          ...(recommendationReason && { recommendationReason }),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || t("addFailed"))
      }

      toast.success(t("addedToWatchlist"))
      if (onWatchlistSuccess) {
        onWatchlistSuccess()
      } else if (redirectTo) {
        router.push(redirectTo)
      }
    } catch (err: unknown) {
      const error = err as Error
      toast.error(error.message || t("addFailed"))
    } finally {
      setAddingToWatchlist(false)
    }
  }

  const handleAddToTracked = async () => {
    setAddingToTracked(true)
    try {
      const response = await fetch("/api/tracked-stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tickerCode,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || t("addFailed"))
      }

      toast.success(t("addedToTracked"))
      if (onTrackedSuccess) {
        onTrackedSuccess(data.id)
      } else if (redirectTo) {
        router.push(redirectTo)
      }
    } catch (err: unknown) {
      const error = err as Error
      toast.error(error.message || t("addFailed"))
    } finally {
      setAddingToTracked(false)
    }
  }

  return (
    <>
      {showWatchlist && (
        isInWatchlist ? (
          <span className="px-2 py-1 text-xs font-medium text-gray-400">
            {ACTION_BUTTON_LABELS.watchlistDone}
          </span>
        ) : (
          <button
            onClick={handleAddToWatchlist}
            disabled={isDisabled}
            className={getActionButtonClass("watchlist", { disabled: true })}
          >
            {addingToWatchlist ? t("adding") : ACTION_BUTTON_LABELS.watchlist}
          </button>
        )
      )}
      {showTracked && (
        isTracked ? (
          <span className="px-2 py-1 text-xs font-medium text-gray-400">
            {ACTION_BUTTON_LABELS.trackedDone}
          </span>
        ) : (
          <button
            onClick={handleAddToTracked}
            disabled={isDisabled}
            className={getActionButtonClass("tracked", { disabled: true })}
          >
            {addingToTracked ? t("adding") : ACTION_BUTTON_LABELS.tracked}
          </button>
        )
      )}
      {showPurchase && onPurchaseClick && (
        <button
          onClick={onPurchaseClick}
          className={getActionButtonClass("purchase")}
        >
          {ACTION_BUTTON_LABELS.purchase}
        </button>
      )}
    </>
  )
}
