import { FETCH_FAIL_WARNING_THRESHOLD } from "@/lib/constants"

interface DelistedWarningProps {
  isDelisted: boolean
  fetchFailCount: number
  compact?: boolean
}

export default function DelistedWarning({ isDelisted, fetchFailCount, compact = false }: DelistedWarningProps) {
  if (isDelisted) {
    if (compact) {
      return (
        <p className="text-xs text-red-700">
          この銘柄はデータを正常に取得できません
        </p>
      )
    }
    return (
      <div className="bg-red-50 border-l-4 border-red-400 p-3 mb-4">
        <p className="text-xs text-red-800">
          この銘柄はデータを正常に取得できません。最新の情報をご確認ください。
        </p>
      </div>
    )
  }

  if (fetchFailCount >= FETCH_FAIL_WARNING_THRESHOLD) {
    if (compact) {
      return (
        <p className="text-xs text-amber-700">
          データ取得不可の可能性があります
        </p>
      )
    }
    return (
      <div className="bg-amber-50 border-l-4 border-amber-400 p-3 mb-4">
        <p className="text-xs text-amber-800">
          この銘柄は株価データの取得に連続して失敗しています。データ取得不可の可能性があります。
        </p>
      </div>
    )
  }

  return null
}
