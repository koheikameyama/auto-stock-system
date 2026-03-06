import { Decimal } from "@prisma/client/runtime/library"

/**
 * Decimal型をnumber型に変換
 * nullの場合はnullを返す
 */
export function formatDecimal(value: Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return Number(value)
}

/**
 * Date型をISO文字列に変換
 * nullの場合はnullを返す
 */
export function formatDate(date: Date | null | undefined): string | null {
  if (date === null || date === undefined) return null
  return date.toISOString()
}

/**
 * 価格フォーマット（Decimal対応）
 * formatDecimalのエイリアス（意図を明確にするため）
 */
export function formatPrice(price: Decimal | null | undefined): number | null {
  return formatDecimal(price)
}

/**
 * 数量フォーマット（Decimal対応）
 * formatDecimalのエイリアス（意図を明確にするため）
 */
export function formatQuantity(quantity: Decimal | null | undefined): number | null {
  return formatDecimal(quantity)
}
