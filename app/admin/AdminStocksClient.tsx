"use client"

import { useState, useEffect, useCallback } from "react"
import { FETCH_FAIL_WARNING_THRESHOLD } from "@/lib/constants"

interface Stock {
  id: string
  tickerCode: string
  name: string
  market: string
  latestPrice: number | null
  fetchFailCount: number
  lastFetchFailedAt: string | null
  isDelisted: boolean
  priceUpdatedAt: string | null
  userCount: number
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

type FilterType = "all" | "failed" | "delisted"

export default function AdminStocksClient() {
  const [stocks, setStocks] = useState<Stock[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 })
  const [filter, setFilter] = useState<FilterType>("all")
  const [search, setSearch] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchStocks = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        filter,
        page: String(page),
        limit: "50",
      })
      if (search) params.set("search", search)

      const response = await fetch(`/api/admin/stocks?${params}`)
      if (!response.ok) throw new Error("Failed to fetch")

      const data = await response.json()
      setStocks(data.stocks)
      setPagination(data.pagination)
    } catch (error) {
      console.error("Error fetching stocks:", error)
    } finally {
      setLoading(false)
    }
  }, [filter, search])

  useEffect(() => {
    fetchStocks()
  }, [fetchStocks])

  const handleToggleDelisted = async (stockId: string, currentValue: boolean) => {
    setUpdating(stockId)
    try {
      const response = await fetch(`/api/admin/stocks/${stockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDelisted: !currentValue }),
      })

      if (!response.ok) throw new Error("Failed to update")

      setStocks((prev) =>
        prev.map((s) =>
          s.id === stockId ? { ...s, isDelisted: !currentValue } : s
        )
      )
    } catch (error) {
      console.error("Error updating stock:", error)
      alert("更新に失敗しました")
    } finally {
      setUpdating(null)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
  }

  const filterButtons: { key: FilterType; label: string }[] = [
    { key: "all", label: "すべて" },
    { key: "failed", label: "取得失敗あり" },
    { key: "delisted", label: "データ取得不可" },
  ]

  const getStatusBadge = (stock: Stock, isWarning: boolean) => {
    if (stock.isDelisted) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
          データ取得不可
        </span>
      )
    }
    if (isWarning) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
          要確認
        </span>
      )
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        正常
      </span>
    )
  }

  const getFailCountBadge = (count: number) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
      count >= FETCH_FAIL_WARNING_THRESHOLD
        ? "bg-red-100 text-red-700"
        : count > 0
          ? "bg-amber-100 text-amber-700"
          : "bg-gray-100 text-gray-600"
    }`}>
      {count}
    </span>
  )

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-4">銘柄マスタ管理</h2>

      {/* フィルター & 検索 */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-wrap gap-2">
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              onClick={() => setFilter(btn.key)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                filter === btn.key
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="銘柄コード or 名前で検索"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            検索
          </button>
        </form>
      </div>

      {/* 件数 */}
      <p className="text-sm text-gray-500 mb-3">
        {pagination.total}件中 {(pagination.page - 1) * pagination.limit + 1}-
        {Math.min(pagination.page * pagination.limit, pagination.total)}件を表示
      </p>

      {/* モバイル: カードレイアウト */}
      <div className="sm:hidden space-y-3">
        {loading ? (
          <div className="py-8 text-center text-gray-400">読み込み中...</div>
        ) : stocks.length === 0 ? (
          <div className="py-8 text-center text-gray-400">該当する銘柄がありません</div>
        ) : (
          stocks.map((stock) => {
            const isWarning = stock.fetchFailCount >= FETCH_FAIL_WARNING_THRESHOLD
            return (
              <div
                key={stock.id}
                className={`bg-white rounded-lg shadow p-4 ${
                  stock.isDelisted
                    ? "border-l-4 border-red-400"
                    : isWarning
                      ? "border-l-4 border-amber-400"
                      : ""
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-gray-900 truncate">{stock.name}</div>
                    <div className="text-xs text-gray-500">
                      {stock.tickerCode} / {stock.market}
                    </div>
                  </div>
                  {getStatusBadge(stock, isWarning)}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center mb-3 py-2 bg-gray-50 rounded-lg">
                  <div>
                    <div className="text-xs text-gray-500">株価</div>
                    <div className="text-sm font-mono font-semibold">
                      {stock.latestPrice != null
                        ? `¥${stock.latestPrice.toLocaleString()}`
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">失敗</div>
                    <div className="text-sm">{getFailCountBadge(stock.fetchFailCount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">利用者</div>
                    <div className="text-sm font-semibold">
                      {stock.userCount > 0 ? (
                        <span className="text-blue-600">{stock.userCount}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-400">
                    {stock.priceUpdatedAt
                      ? `更新: ${new Date(stock.priceUpdatedAt).toLocaleDateString("ja-JP")}`
                      : "未更新"}
                  </div>
                  <button
                    onClick={() => handleToggleDelisted(stock.id, stock.isDelisted)}
                    disabled={updating === stock.id}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg shadow-sm border transition-colors disabled:opacity-50 ${
                      stock.isDelisted
                        ? "bg-white text-green-700 border-green-300 hover:bg-green-50"
                        : "bg-white text-red-700 border-red-300 hover:bg-red-50"
                    }`}
                  >
                    {updating === stock.id
                      ? "更新中..."
                      : stock.isDelisted
                        ? "解除"
                        : "停止"}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* デスクトップ: テーブルレイアウト */}
      <div className="hidden sm:block bg-white rounded-lg shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">銘柄</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">最新株価</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">失敗回数</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">利用者数</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">状態</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  読み込み中...
                </td>
              </tr>
            ) : stocks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  該当する銘柄がありません
                </td>
              </tr>
            ) : (
              stocks.map((stock) => {
                const isWarning = stock.fetchFailCount >= FETCH_FAIL_WARNING_THRESHOLD
                return (
                  <tr
                    key={stock.id}
                    className={`border-b border-gray-100 ${
                      stock.isDelisted
                        ? "bg-red-50"
                        : isWarning
                          ? "bg-amber-50"
                          : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-semibold text-gray-900">{stock.name}</span>
                        <span className="ml-2 text-xs text-gray-500">{stock.tickerCode}</span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {stock.market}
                        {stock.priceUpdatedAt && (
                          <span className="ml-2">
                            更新: {new Date(stock.priceUpdatedAt).toLocaleDateString("ja-JP")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {stock.latestPrice != null
                        ? `¥${stock.latestPrice.toLocaleString()}`
                        : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getFailCountBadge(stock.fetchFailCount)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {stock.userCount > 0 ? (
                        <span className="text-blue-600 font-semibold">{stock.userCount}</span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(stock, isWarning)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleToggleDelisted(stock.id, stock.isDelisted)}
                        disabled={updating === stock.id}
                        className={`px-4 py-1.5 text-xs font-semibold rounded-lg shadow-sm border transition-colors disabled:opacity-50 ${
                          stock.isDelisted
                            ? "bg-white text-green-700 border-green-300 hover:bg-green-50"
                            : "bg-white text-red-700 border-red-300 hover:bg-red-50"
                        }`}
                      >
                        {updating === stock.id
                          ? "更新中..."
                          : stock.isDelisted
                            ? "解除"
                            : "停止"}
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ページネーション */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-4">
          <button
            onClick={() => fetchStocks(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            前へ
          </button>
          <span className="px-3 py-2 text-sm text-gray-600">
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            onClick={() => fetchStocks(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  )
}
