import { describe, it, expect, vi, beforeEach } from "vitest";

// ========================================
// モック設定
// ========================================

vi.mock("../../lib/prisma", () => ({
  prisma: {
    tradingPosition: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../broker-orders", () => ({
  submitOrder: vi.fn().mockResolvedValue({
    success: true,
    orderNumber: "SL-001",
    businessDay: "20260320",
  }),
  cancelOrder: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("../../lib/slack", () => ({
  notifySlack: vi.fn().mockResolvedValue(undefined),
}));


import { submitBrokerSL, cancelBrokerSL, updateBrokerSL } from "../broker-sl-manager";
import { prisma } from "../../lib/prisma";
import { submitOrder, cancelOrder } from "../broker-orders";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any;
const mockSubmitOrder = vi.mocked(submitOrder);
const mockCancelOrder = vi.mocked(cancelOrder);

// ========================================
// submitBrokerSL
// ========================================

describe("submitBrokerSL", () => {
  beforeEach(() => {
    vi.clearAllMocks();

  });

  it("SL注文を発注してポジションに紐付ける", async () => {
    await submitBrokerSL({
      positionId: "pos-1",
      ticker: "7203.T",
      quantity: 100,
      stopTriggerPrice: 970,
      strategy: "breakout",
    });

    expect(mockSubmitOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: "7203.T",
        side: "sell",
        quantity: 100,
        limitPrice: null,
        stopTriggerPrice: 970,
      }),
    );

    // ポジションにSL注文IDを保存
    expect(mockPrisma.tradingPosition.update).toHaveBeenCalledWith({
      where: { id: "pos-1" },
      data: {
        slBrokerOrderId: "SL-001",
        slBrokerBusinessDay: "20260320",
      },
    });
  });

  it("expireDayが設定される（YYYYMMDD形式）", async () => {
    await submitBrokerSL({
      positionId: "pos-1",
      ticker: "7203.T",
      quantity: 100,
      stopTriggerPrice: 970,
      strategy: "breakout",
    });

    const call = mockSubmitOrder.mock.calls[0][0];
    expect(call.expireDay).toBeDefined();
    expect(call.expireDay).toMatch(/^\d{8}$/); // YYYYMMDD
  });

  it("submitOrder失敗時もthrowしない", async () => {
    mockSubmitOrder.mockResolvedValue({
      success: false,
      error: "API error",
    });

    await expect(
      submitBrokerSL({
        positionId: "pos-1",
        ticker: "7203.T",
        quantity: 100,
        stopTriggerPrice: 970,
        strategy: "breakout",
      }),
    ).resolves.not.toThrow();

    // ポジション更新はされない
    expect(mockPrisma.tradingPosition.update).not.toHaveBeenCalled();
  });
});

// ========================================
// cancelBrokerSL
// ========================================

describe("cancelBrokerSL", () => {
  beforeEach(() => {
    vi.clearAllMocks();

  });

  it("SL注文を取消してフィールドをクリアする", async () => {
    mockPrisma.tradingPosition.findUnique.mockResolvedValue({
      slBrokerOrderId: "SL-001",
      slBrokerBusinessDay: "20260320",
      stock: { tickerCode: "7203.T" },
    });

    await cancelBrokerSL("pos-1");

    expect(mockCancelOrder).toHaveBeenCalledWith("SL-001", "20260320", expect.any(String));
    expect(mockPrisma.tradingPosition.update).toHaveBeenCalledWith({
      where: { id: "pos-1" },
      data: {
        slBrokerOrderId: null,
        slBrokerBusinessDay: null,
      },
    });
  });

  it("SL注文が紐付いていない場合は何もしない", async () => {
    mockPrisma.tradingPosition.findUnique.mockResolvedValue({
      slBrokerOrderId: null,
      slBrokerBusinessDay: null,
    });

    await cancelBrokerSL("pos-1");

    expect(mockCancelOrder).not.toHaveBeenCalled();
    expect(mockPrisma.tradingPosition.update).not.toHaveBeenCalled();
  });

  it("既に約定/取消の場合はDBをクリアする（already gone扱い）", async () => {
    mockPrisma.tradingPosition.findUnique.mockResolvedValue({
      slBrokerOrderId: "SL-001",
      slBrokerBusinessDay: "20260320",
      stock: { tickerCode: "7203.T" },
    });
    mockCancelOrder.mockResolvedValue({
      success: false,
      error: "既に約定済みです",
    });

    await cancelBrokerSL("pos-1");

    expect(mockPrisma.tradingPosition.update).toHaveBeenCalledWith({
      where: { id: "pos-1" },
      data: {
        slBrokerOrderId: null,
        slBrokerBusinessDay: null,
      },
    });
  });

  it("取消が本当に失敗した場合はDBを維持する（整合性保証）", async () => {
    mockPrisma.tradingPosition.findUnique.mockResolvedValue({
      slBrokerOrderId: "SL-001",
      slBrokerBusinessDay: "20260320",
      stock: { tickerCode: "7203.T" },
    });
    mockCancelOrder.mockResolvedValue({
      success: false,
      error: "ネットワークエラー",
    });

    await cancelBrokerSL("pos-1");

    // 立花側に注文が残っている可能性があるのでDBはそのまま
    expect(mockPrisma.tradingPosition.update).not.toHaveBeenCalled();
  });
});

// ========================================
// updateBrokerSL
// ========================================

describe("updateBrokerSL", () => {
  beforeEach(() => {
    vi.clearAllMocks();

  });

  it("cancel → resubmit の順序で実行する", async () => {
    // 1回目: cancelBrokerSL内の既存SL取得、2回目: updateBrokerSL内の再確認(クリア後)
    mockPrisma.tradingPosition.findUnique
      .mockResolvedValueOnce({
        slBrokerOrderId: "SL-OLD",
        slBrokerBusinessDay: "20260320",
        stock: { tickerCode: "7203.T" },
      })
      .mockResolvedValueOnce({
        slBrokerOrderId: null,
      });

    const callOrder: string[] = [];
    mockCancelOrder.mockImplementation(async () => {
      callOrder.push("cancel");
      return { success: true };
    });
    mockSubmitOrder.mockImplementation(async () => {
      callOrder.push("submit");
      return {
        success: true,
        orderNumber: "SL-NEW",
        businessDay: "20260320",
      };
    });

    await updateBrokerSL({
      positionId: "pos-1",
      ticker: "7203.T",
      quantity: 100,
      newStopTriggerPrice: 980,
      strategy: "breakout",
    });

    expect(callOrder).toEqual(["cancel", "submit"]);
    expect(mockCancelOrder).toHaveBeenCalledWith("SL-OLD", "20260320", expect.any(String));
    expect(mockSubmitOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        stopTriggerPrice: 980,
      }),
    );
  });

  it("cancel失敗時は resubmit をスキップする（重複発注防止）", async () => {
    // 1回目: 既存SL取得、2回目: cancelBrokerSL失敗でDB維持されたままの再確認
    mockPrisma.tradingPosition.findUnique
      .mockResolvedValueOnce({
        slBrokerOrderId: "SL-OLD",
        slBrokerBusinessDay: "20260320",
        stock: { tickerCode: "7203.T" },
      })
      .mockResolvedValueOnce({
        slBrokerOrderId: "SL-OLD",
      });
    mockCancelOrder.mockResolvedValue({
      success: false,
      error: "ネットワークエラー",
    });

    await updateBrokerSL({
      positionId: "pos-1",
      ticker: "7203.T",
      quantity: 100,
      newStopTriggerPrice: 980,
      strategy: "breakout",
    });

    // cancel失敗でDB維持 → submit呼ばれない
    expect(mockSubmitOrder).not.toHaveBeenCalled();
  });

});
