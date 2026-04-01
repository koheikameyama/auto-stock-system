import dayjs from "dayjs"
import utc from "dayjs/plugin/utc"
import timezone from "dayjs/plugin/timezone"
import { CME_TRADING_HOURS, TIMEZONE } from "./constants"

dayjs.extend(utc)
dayjs.extend(timezone)

export type CMEStatus = "open" | "closed" | "break"
/**
 * CME日経先物の取引ステータスを取得
 *
 * 取引時間（JST）:
 * - 月曜07:00 ～ 土曜06:00（ほぼ24時間）
 * - 日次休憩: 毎日06:00～07:00
 * - 週末休場: 土曜06:00 ～ 月曜07:00
 */
export function getCMEStatus(now?: Date): CMEStatus {
  const jst = dayjs(now).tz(TIMEZONE)
  const day = jst.day() // 0=日, 1=月, ..., 6=土
  const hour = jst.hour()

  // 日曜日 → 休場
  if (day === 0) return "closed"

  // 土曜日
  if (day === CME_TRADING_HOURS.WEEK_END_DAY) {
    // 06:00以降 → 休場
    if (hour >= CME_TRADING_HOURS.WEEK_END_HOUR_JST) return "closed"
    // 06:00未満 → 金曜のセッション継続中だが日次休憩チェック
  }

  // 月～土（06:00未満）: 日次休憩チェック
  if (
    hour >= CME_TRADING_HOURS.DAILY_BREAK_START_HOUR_JST &&
    hour < CME_TRADING_HOURS.DAILY_BREAK_END_HOUR_JST
  ) {
    // 月曜の06:00-07:00は週末休場扱い
    if (day === CME_TRADING_HOURS.WEEK_START_DAY) return "closed"
    return "break"
  }

  // 月～金の07:00～翌06:00 → 取引中
  return "open"
}

