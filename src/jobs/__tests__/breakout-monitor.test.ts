import { describe, it, expect, vi, beforeEach } from "vitest";

// ========================================
// モック設定
// ========================================

const {
  mockGetWatchlist,
  mockFetchQuotes,
  mockExecuteEntry,
  mockResizePendingOrders,
  mockInvalidateStalePendingOrders,
  mockGetCashBalance,
  mockNotifySlack,
  mockAssessmentFindUnique,
  mockPositionFindMany,
  mockOrderFindMany,
  mockBreakoutScan,
  mockBreakoutGetState,
  mockBreakoutAddPremiseCollapsed,
  mockBreakoutRemoveFromTriggeredToday,
  mockGetContrarianHistoryBatch,
  mockCalculateContinuousContrarianBonus,
} = vi.hoisted(() => ({
  mockGetWatchlist: vi.fn(),
  mockFetchQuotes: vi.fn(),
  mockExecuteEntry: vi.fn().mockResolvedValue({ success: true }),
  mockResizePendingOrders: vi.fn().mockResolvedValue(undefined),
  mockInvalidateStalePendingOrders: vi.fn().mockResolvedValue(new Set<string>()),
  mockGetCashBalance: vi.fn().mockResolvedValue(1_000_000),
  mockNotifySlack: vi.fn().mockResolvedValue(undefined),
  mockAssessmentFindUnique: vi.fn(),
  mockPositionFindMany: vi.fn().mockResolvedValue([]),
  mockOrderFindMany: vi.fn().mockResolvedValue([]),
  mockBreakoutScan: vi.fn().mockReturnValue([]),
  mockBreakoutGetState: vi.fn().mockReturnValue({
    triggeredToday: new Set<string>(),
    premiseCollapsedToday: new Set<string>(),
    lastSurgeRatios: new Map<string, number>(),
  }),
  mockBreakoutAddPremiseCollapsed: vi.fn(),
  mockBreakoutRemoveFromTriggeredToday: vi.fn(),
  mockGetContrarianHistoryBatch: vi.fn().mockResolvedValue(new Map()),
  mockCalculateContinuousContrarianBonus: vi.fn().mockReturnValue(0),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    marketAssessment: { findUnique: mockAssessmentFindUnique },
    tradingPosition: { findMany: mockPositionFindMany },
    tradingOrder: { findMany: mockOrderFindMany },
  },
}));

vi.mock("../../core/breakout/breakout-scanner", () => ({
  BreakoutScanner: class {
    scan = mockBreakoutScan;
    getState = mockBreakoutGetState;
    addPremiseCollapsed = mockBreakoutAddPremiseCollapsed;
    removeFromTriggeredToday = mockBreakoutRemoveFromTriggeredToday;
  },
}));

vi.mock("../watchlist-builder", () => ({ getWatchlist: mockGetWatchlist }));
vi.mock("../../lib/tachibana-price-client", () => ({
  tachibanaFetchQuotesBatch: mockFetchQuotes,
}));
vi.mock("../../core/breakout/entry-executor", () => ({
  executeEntry: mockExecuteEntry,
  resizePendingOrders: mockResizePendingOrders,
  invalidateStalePendingOrders: mockInvalidateStalePendingOrders,
}));
vi.mock("../../core/position-manager", () => ({
  getCashBalance: mockGetCashBalance,
}));
vi.mock("../../lib/slack", () => ({ notifySlack: mockNotifySlack }));
vi.mock("../../lib/market-date", () => ({
  getTodayForDB: vi.fn().mockReturnValue(new Date("2026-04-10T00:00:00Z")),
}));
vi.mock("../../core/contrarian-analyzer", () => ({
  getContrarianHistoryBatch: mockGetContrarianHistoryBatch,
  calculateContinuousContrarianBonus: mockCalculateContinuousContrarianBonus,
}));

import { main, resetScanner } from "../breakout-monitor";

// ========================================
// ヘルパー
// ========================================

function makeQuote(ticker: string, price = 1000) {
  return {
    tickerCode: ticker,
    price,
    volume: 200_000,
    open: price - 10,
    high: price + 10,
    low: price - 15,
    askPrice: price + 1,
    bidPrice: price - 1,
    askSize: 100,
    bidSize: 100,
  };
}

function makeTrigger(ticker: string, price = 1000) {
  return {
    ticker,
    currentPrice: price,
    volume: 200_000,
    volumeSurgeRatio: 2.5,
    atr14: 20,
    high20: price - 10,
    triggeredAt: new Date(),
  };
}

function setupDefaults() {
  mockAssessmentFindUnique.mockResolvedValue({ shouldTrade: true });
  mockGetWatchlist.mockResolvedValue([
    { ticker: "7203", avgVolume25: 100_000, high20: 1000, atr14: 20, latestClose: 980 },
  ]);
  mockFetchQuotes.mockResolvedValue([makeQuote("7203")]);
  mockInvalidateStalePendingOrders.mockResolvedValue(new Set<string>());
  mockGetCashBalance.mockResolvedValue(1_000_000);
}

// ========================================
// テスト
// ========================================

describe("breakout-monitor main()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetScanner();
  });

  it("ウォッチリスト空→時価取得しない", async () => {
    mockGetWatchlist.mockResolvedValue([]);
    await main();
    expect(mockFetchQuotes).not.toHaveBeenCalled();
  });

  it("MarketAssessment未作成→スキップ", async () => {
    setupDefaults();
    mockAssessmentFindUnique.mockResolvedValue(null);
    await main();
    expect(mockFetchQuotes).not.toHaveBeenCalled();
  });

  it("shouldTrade=false→スキップ", async () => {
    setupDefaults();
    mockAssessmentFindUnique.mockResolvedValue({ shouldTrade: false });
    await main();
    expect(mockFetchQuotes).not.toHaveBeenCalled();
  });

  it("時価取得0件→スキャンしない", async () => {
    setupDefaults();
    mockFetchQuotes.mockResolvedValue([null]);
    await main();
    expect(mockBreakoutScan).not.toHaveBeenCalled();
  });

  it("トリガーなし→executeEntryを呼ばない", async () => {
    setupDefaults();
    mockBreakoutScan.mockReturnValue([]);
    await main();
    expect(mockExecuteEntry).not.toHaveBeenCalled();
  });

  it("トリガー発火→executeEntryを呼ぶ", async () => {
    setupDefaults();
    const trigger = makeTrigger("7203");
    mockBreakoutScan.mockReturnValue([trigger]);
    await main();
    expect(mockExecuteEntry).toHaveBeenCalledWith(trigger);
  });

  it("トリガー発火時にresizePendingOrdersを呼ぶ", async () => {
    setupDefaults();
    mockBreakoutScan.mockReturnValue([makeTrigger("7203")]);
    await main();
    expect(mockResizePendingOrders).toHaveBeenCalled();
  });

  it("残高<=0→全トリガースキップ", async () => {
    setupDefaults();
    mockBreakoutScan.mockReturnValue([makeTrigger("7203")]);
    mockGetCashBalance.mockResolvedValue(0);
    await main();
    expect(mockExecuteEntry).not.toHaveBeenCalled();
  });

  it("エントリー失敗（retryable）→removeFromTriggeredTodayを呼ぶ", async () => {
    setupDefaults();
    mockBreakoutScan.mockReturnValue([makeTrigger("7203")]);
    mockExecuteEntry.mockResolvedValue({
      success: false,
      retryable: true,
      reason: "残高不足",
    });
    await main();
    expect(mockBreakoutRemoveFromTriggeredToday).toHaveBeenCalledWith("7203");
    expect(mockNotifySlack).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("エントリー失敗") }),
    );
  });

  it("エントリー失敗（non-retryable）→Slack warning", async () => {
    setupDefaults();
    mockBreakoutScan.mockReturnValue([makeTrigger("7203")]);
    mockExecuteEntry.mockResolvedValue({
      success: false,
      retryable: false,
      reason: "RR不足",
    });
    await main();
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("エントリー失敗"),
        color: "warning",
      }),
    );
  });

  it("エントリー例外→Slack danger", async () => {
    setupDefaults();
    mockBreakoutScan.mockReturnValue([makeTrigger("7203")]);
    mockExecuteEntry.mockRejectedValue(new Error("接続エラー"));
    await main();
    expect(mockNotifySlack).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("エントリー例外"),
        color: "danger",
      }),
    );
  });

  it("前提崩壊銘柄はscannerに記録される", async () => {
    setupDefaults();
    mockInvalidateStalePendingOrders.mockResolvedValue(new Set(["7203"]));
    mockBreakoutScan.mockReturnValue([]);
    await main();
    expect(mockBreakoutAddPremiseCollapsed).toHaveBeenCalledWith("7203");
  });

  it("保有中ティッカーがscannerに渡される", async () => {
    setupDefaults();
    mockPositionFindMany.mockResolvedValue([
      { stock: { tickerCode: "7203" } },
    ]);
    await main();
    expect(mockBreakoutScan).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Date),
      new Set(["7203"]),
    );
  });
});
