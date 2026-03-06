/**
 * 日付ユーティリティ
 *
 * 全ての日付計算はJST（日本時間）基準で統一する。
 * @db.Date カラムにはJSTの日付がそのまま保存されるように、
 * UTC 00:00:00 としてDateオブジェクトを作成する。
 *
 * 例: 2024-06-10 10:00 JST に実行した場合
 * - getTodayForDB() → 2024-06-10T00:00:00.000Z（PostgreSQL date型で 2024-06-10 として保存）
 * - getDaysAgoForDB(7) → 2024-06-03T00:00:00.000Z（PostgreSQL date型で 2024-06-03 として保存）
 */

import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"

dayjs.extend(utc)
dayjs.extend(timezone)

const JST = "Asia/Tokyo"

/**
 * JSTの日付をそのままUTC 00:00のDateオブジェクトとして返す
 * PostgreSQLの date 型に正しいJST日付が保存される
 */
function jstDateAsUTC(d: dayjs.Dayjs): Date {
  return new Date(Date.UTC(d.year(), d.month(), d.date()))
}

/**
 * 今日の日付（JST基準）
 * DB保存・検索用
 */
export function getTodayForDB(): Date {
  return jstDateAsUTC(dayjs().tz(JST).startOf("day"))
}

/**
 * N日前の日付（JST基準）
 * DB検索用（範囲検索など）
 */
export function getDaysAgoForDB(days: number): Date {
  return jstDateAsUTC(dayjs().tz(JST).subtract(days, "day").startOf("day"))
}

/**
 * 指定日時をJST基準の日付に変換
 */
export function toJSTDateForDB(date: Date | string): Date {
  return jstDateAsUTC(dayjs(date).tz(JST).startOf("day"))
}
