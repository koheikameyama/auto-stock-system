"use client"

import { useTranslations } from "next-intl"

interface SectorComparisonProps {
  stock: {
    per?: number | null
    pbr?: number | null
    roe?: number | null
    sector?: string | null
  }
  sectorAvg: {
    avgPER: number | null
    avgPBR: number | null
    avgROE: number | null
  } | null
  embedded?: boolean
}

interface ComparisonRowProps {
  label: string
  technicalName: string
  stockValue: number | null | undefined
  sectorAvg: number | null
  format: (v: number) => string
  lowerIsBetter?: boolean
}

function ComparisonRow({ label, technicalName, stockValue, sectorAvg, format, lowerIsBetter = false }: ComparisonRowProps) {
  const t = useTranslations('stocks.sectorComparison')

  if (stockValue == null || sectorAvg == null) return null

  const diff = stockValue - sectorAvg
  const diffPercent = sectorAvg !== 0 ? (diff / Math.abs(sectorAvg)) * 100 : 0

  let evaluation: string
  let colorClass: string

  if (lowerIsBetter) {
    // PER/PBR: 低い方が良い
    if (diffPercent < -10) {
      evaluation = t('cheaper')
      colorClass = "text-green-600"
    } else if (diffPercent > 10) {
      evaluation = t('expensive')
      colorClass = "text-red-600"
    } else {
      evaluation = t('average')
      colorClass = "text-gray-600"
    }
  } else {
    // ROE: 高い方が良い
    if (diffPercent > 10) {
      evaluation = t('efficient')
      colorClass = "text-green-600"
    } else if (diffPercent < -10) {
      evaluation = t('belowAverage')
      colorClass = "text-red-600"
    } else {
      evaluation = t('average')
      colorClass = "text-gray-600"
    }
  }

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-900">{label}</span>
        <span className="text-xs text-gray-500">({technicalName})</span>
      </div>
      <div className="flex items-end gap-4">
        <div>
          <p className="text-xs text-gray-500">{t('stockValue')}</p>
          <p className="text-lg font-bold text-gray-900">{format(stockValue)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">{t('sectorAvg')}</p>
          <p className="text-lg text-gray-500">{format(sectorAvg)}</p>
        </div>
        <span className={`text-sm font-semibold ${colorClass} ml-auto`}>
          {evaluation}
        </span>
      </div>
    </div>
  )
}

export default function SectorComparison({ stock, sectorAvg, embedded = false }: SectorComparisonProps) {
  const t = useTranslations('stocks.sectorComparison')

  if (!sectorAvg || !stock.sector) return null

  const hasAnyData =
    (stock.per != null && sectorAvg.avgPER != null) ||
    (stock.pbr != null && sectorAvg.avgPBR != null) ||
    (stock.roe != null && sectorAvg.avgROE != null)

  if (!hasAnyData) return null

  const wrapperClass = embedded
    ? ""
    : "bg-white rounded-xl shadow-md p-4 sm:p-6 mb-6"

  return (
    <section className={wrapperClass}>
      <div className="mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
          {t('title')}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          {t('subtitle')}（{stock.sector}）
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ComparisonRow
          label="収益性"
          technicalName="PER"
          stockValue={stock.per}
          sectorAvg={sectorAvg.avgPER}
          format={(v) => `${v.toFixed(1)}倍`}
          lowerIsBetter
        />

        <ComparisonRow
          label="割安度"
          technicalName="PBR"
          stockValue={stock.pbr}
          sectorAvg={sectorAvg.avgPBR}
          format={(v) => `${v.toFixed(2)}倍`}
          lowerIsBetter
        />

        <ComparisonRow
          label="稼ぐ力"
          technicalName="ROE"
          stockValue={stock.roe != null ? stock.roe * 100 : null}
          sectorAvg={sectorAvg.avgROE != null ? sectorAvg.avgROE * 100 : null}
          format={(v) => `${v.toFixed(1)}%`}
        />
      </div>
    </section>
  )
}
