import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import relativeTime from "dayjs/plugin/relativeTime"
import "dayjs/locale/ja"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(relativeTime)
dayjs.locale("ja")

/**
 * 分析時間帯のラベルを取得
 * - 6:00-9:00 → 「寄り前」
 * - 9:00-11:30 → 「前場」
 * - 11:30-12:30 → 「昼休み」
 * - 12:30-15:00 → 「後場」
 * - 15:00-18:00 → 「大引け」
 * - 18:00以降 → 「夕方」
 */
export function getTimeSlotLabel(dateString: string): string {
  const date = dayjs(dateString).tz("Asia/Tokyo")
  const hour = date.hour()
  const minute = date.minute()
  const timeInMinutes = hour * 60 + minute

  if (timeInMinutes < 6 * 60) {
    return "深夜"
  } else if (timeInMinutes < 9 * 60) {
    return "寄り前"
  } else if (timeInMinutes < 11 * 60 + 30) {
    return "前場"
  } else if (timeInMinutes < 12 * 60 + 30) {
    return "昼休み"
  } else if (timeInMinutes < 15 * 60) {
    return "後場"
  } else if (timeInMinutes < 18 * 60) {
    return "大引け"
  } else {
    return "夕方"
  }
}

/**
 * 相対的な経過時間を取得（「2時間前」など）
 */
export function getRelativeTime(dateString: string): string {
  return dayjs(dateString).fromNow()
}

/**
 * 分析の鮮度状態を取得
 * - fresh: 2時間以内
 * - normal: 2-6時間
 * - stale: 6時間以上
 */
export function getFreshnessStatus(dateString: string): "fresh" | "normal" | "stale" {
  const now = dayjs()
  const analyzed = dayjs(dateString)
  const diffHours = now.diff(analyzed, "hour")

  if (diffHours < 2) {
    return "fresh"
  } else if (diffHours < 6) {
    return "normal"
  } else {
    return "stale"
  }
}

/**
 * 鮮度に応じたスタイルクラスを取得
 */
export function getFreshnessColorClass(status: "fresh" | "normal" | "stale"): string {
  switch (status) {
    case "fresh":
      return "text-green-600"
    case "normal":
      return "text-gray-500"
    case "stale":
      return "text-orange-500"
  }
}

/**
 * 購入判断の表示モードを取得
 * - actionable: 取引時間中（09:30-15:30）→ アクション可能な分析として表示
 * - informational: 取引時間外 → 情報提供・準備として表示
 */
export type RecommendationDisplayMode = "actionable" | "informational"

export function getRecommendationDisplayMode(): RecommendationDisplayMode {
  const now = dayjs().tz("Asia/Tokyo")
  const timeInMinutes = now.hour() * 60 + now.minute()

  const actionableStart = 9 * 60 + 30  // 09:30
  const actionableEnd = 15 * 60 + 30   // 15:30

  if (timeInMinutes >= actionableStart && timeInMinutes < actionableEnd) {
    return "actionable"
  }
  return "informational"
}

/**
 * 取引時間前（寄り前）かどうかを判定
 */
export function isPreMarketTime(): boolean {
  const now = dayjs().tz("Asia/Tokyo")
  const timeInMinutes = now.hour() * 60 + now.minute()
  return timeInMinutes < 9 * 60 + 30 // 09:30より前
}

/**
 * 分析日時の表示用フォーマット
 * 例: 「寄り前分析 (2時間前)」
 */
export function formatAnalysisTime(dateString: string): {
  label: string
  relative: string
  freshness: "fresh" | "normal" | "stale"
  colorClass: string
} {
  const label = getTimeSlotLabel(dateString)
  const relative = getRelativeTime(dateString)
  const freshness = getFreshnessStatus(dateString)
  const colorClass = getFreshnessColorClass(freshness)

  return {
    label: `${label}分析`,
    relative,
    freshness,
    colorClass,
  }
}
