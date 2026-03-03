"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface UserStock {
  id: string;
  userId: string;
  stockId: string;
  type: "watchlist" | "portfolio";
  // Portfolio fields
  quantity?: number;
  averagePurchasePrice?: number;
  purchaseDate?: string;
  lastAnalysis?: string | null;
  shortTerm?: string | null;
  mediumTerm?: string | null;
  longTerm?: string | null;
  stock: {
    id: string;
    tickerCode: string;
    name: string;
    sector: string | null;
    market: string;
    currentPrice: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

interface SearchResult {
  id: string;
  tickerCode: string;
  name: string;
  market: string;
  sector: string | null;
  latestPrice: number | null;
}

interface AddStockDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (stock: UserStock) => void;
  defaultType: "portfolio" | "watchlist" | "tracked";
  // 事前選択された銘柄（おすすめから追加する場合など）
  initialStock?: SearchResult | null;
}

export default function AddStockDialog({
  isOpen,
  onClose,
  onSuccess,
  defaultType,
  initialStock,
}: AddStockDialogProps) {
  const t = useTranslations("portfolio.addStockDialog");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null);

  // Portfolio fields
  const [quantity, setQuantity] = useState("");
  const [averagePrice, setAveragePrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 検索機能
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // 既に銘柄が選択されている場合は検索をスキップ
    if (selectedStock) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    if (searchQuery.trim().length < 1) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/stocks/search?q=${encodeURIComponent(searchQuery)}`,
        );
        const data = await response.json();
        setSearchResults(data.stocks || []);
        setShowResults(true);
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setSearching(false);
      }
    }, 300); // 300msのデバウンス
  }, [searchQuery, selectedStock]);

  // ダイアログを開いた時にフォームをリセット、または初期値を設定
  useEffect(() => {
    if (isOpen) {
      if (initialStock) {
        // 初期銘柄が指定されている場合
        setSelectedStock(initialStock);
        setSearchQuery(`${initialStock.tickerCode} - ${initialStock.name}`);
      } else {
        // 初期銘柄がない場合はフォームをリセット
        setSearchQuery("");
        setSelectedStock(null);
      }
      // 共通のリセット
      setQuantity("100");
      setAveragePrice(initialStock?.latestPrice?.toString() ?? "");
      setPurchaseDate(new Date().toISOString().split("T")[0]);
      setSearchResults([]);
      setShowResults(false);
      setError(null);
    }
  }, [isOpen, initialStock]);

  const handleSelectStock = (stock: SearchResult) => {
    // 検索タイムアウトをクリアして、再検索を防ぐ
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    // 検索結果を先に非表示にする
    setShowResults(false);
    setSearchResults([]);
    // 選択状態を設定
    setSelectedStock(stock);
    // 現在価格をデフォルト値として設定
    if (stock.latestPrice) {
      setAveragePrice(stock.latestPrice.toString());
    }
    // 最後にsearchQueryを更新（useEffectをトリガーするが、selectedStockがあるのでスキップされる）
    setSearchQuery(`${stock.tickerCode} - ${stock.name}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 検索クエリから銘柄コードを取得
    let tickerCode = "";

    if (selectedStock) {
      // 検索結果から選択した場合
      tickerCode = selectedStock.tickerCode;
    } else if (searchQuery.trim()) {
      // 直接銘柄コードを入力した場合
      tickerCode = searchQuery.trim().toUpperCase();
      // .T が含まれていなければ追加
      if (!tickerCode.includes(".")) {
        tickerCode += ".T";
      }
    } else {
      setError(t("errorNoTicker"));
      return;
    }

    // Validate portfolio fields
    if (defaultType === "portfolio") {
      if (!quantity || parseInt(quantity) <= 0) {
        setError(t("errorNoQuantity"));
        return;
      }
      if (!averagePrice || parseFloat(averagePrice) <= 0) {
        setError(t("errorNoPrice"));
        return;
      }
    }

    setLoading(true);

    try {
      let newStock;

      if (defaultType === "tracked") {
        // 追跡銘柄の場合は別APIを使用
        const response = await fetch("/api/tracked-stocks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tickerCode }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || t("addFailed"));
        }

        newStock = await response.json();
      } else {
        // ウォッチリスト・ポートフォリオの場合
        const body: any = {
          tickerCode,
          type: defaultType,
        };

        // Add type-specific fields
        if (defaultType === "portfolio") {
          body.quantity = parseInt(quantity);
          body.averagePurchasePrice = parseFloat(averagePrice);
          body.purchaseDate = purchaseDate;
        }

        const response = await fetch("/api/user-stocks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || t("addFailed"));
        }

        newStock = await response.json();
      }

      onSuccess(newStock);

      // Reset form
      setSearchQuery("");
      setSelectedStock(null);
      setQuantity("");
      setAveragePrice("");
      setPurchaseDate(new Date().toISOString().split("T")[0]);
    } catch (err: any) {
      const errorMessage = err.message || t("addFailed");
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            {defaultType === "portfolio"
              ? t("titlePortfolio")
              : defaultType === "tracked"
                ? t("titleTracked")
                : t("titleWatchlist")}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 銘柄検索 */}
          <div className="relative">
            <label
              htmlFor="searchQuery"
              className="block text-sm font-semibold text-gray-700 mb-2"
            >
              {t("searchLabel")} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="searchQuery"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                // 入力欄を編集したら選択状態をクリア
                if (selectedStock) {
                  setSelectedStock(null);
                }
              }}
              placeholder={t("searchPlaceholder")}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoComplete="off"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              {t("tseOnlyNote")}
            </p>
            {searching && (
              <div className="absolute right-3 top-11 text-gray-400">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            )}

            {/* 検索結果 */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((stock) => (
                  <button
                    key={stock.id}
                    type="button"
                    onClick={() => handleSelectStock(stock)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="font-semibold text-gray-900">
                      {stock.name}
                    </div>
                    <div className="text-sm text-gray-600 flex items-center gap-2 mt-1">
                      <span>{stock.tickerCode}</span>
                      {stock.sector && (
                        <>
                          <span>•</span>
                          <span>{stock.sector}</span>
                        </>
                      )}
                      {stock.latestPrice && (
                        <>
                          <span>•</span>
                          <span>¥{stock.latestPrice.toLocaleString()}</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* 検索結果なし */}
            {showResults &&
              searchQuery.length >= 1 &&
              searchResults.length === 0 &&
              !searching && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm text-gray-600">
                      {t("noResultsFound")}
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowResults(false)}
                      className="text-gray-400 hover:text-gray-600 ml-2"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">
                    {t("noResultsHint")}
                  </p>
                </div>
              )}
          </div>

          {/* Portfolio fields */}
          {defaultType === "portfolio" && (
            <div
              onClick={() => {
                // 他のフィールドをクリックしたら検索結果を閉じる
                if (showResults) {
                  setShowResults(false);
                }
              }}
            >
              <div>
                <label
                  htmlFor="quantity"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  {t("quantityLabel")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="quantity"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="1"
                  placeholder={t("quantityPlaceholder")}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="averagePrice"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  {t("averagePriceLabel")} <span className="text-red-500">*</span>
                  {selectedStock?.latestPrice && (
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {t("currentPriceHint", { price: selectedStock.latestPrice.toLocaleString() })}
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  id="averagePrice"
                  value={averagePrice}
                  onChange={(e) => setAveragePrice(e.target.value)}
                  min="0"
                  step="0.01"
                  placeholder={t("averagePricePlaceholder")}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  {t("averagePriceHint")}
                </p>
              </div>

              <div>
                <label
                  htmlFor="purchaseDate"
                  className="block text-sm font-semibold text-gray-700 mb-2"
                >
                  {t("purchaseDateLabel")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="purchaseDate"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              disabled={loading}
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-lg font-semibold transition-colors text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              disabled={loading || (!selectedStock && !searchQuery.trim())}
            >
              {loading ? t("adding") : t("add")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
