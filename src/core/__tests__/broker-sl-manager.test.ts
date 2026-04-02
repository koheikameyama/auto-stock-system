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
    });

    await cancelBrokerSL("pos-1");

    expect(mockCancelOrder).toHaveBeenCalledWith("SL-001", "20260320");
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

  it("cancelOrder失敗時もフィールドをクリアする", async () => {
    mockPrisma.tradingPosition.findUnique.mockResolvedValue({
      slBrokerOrderId: "SL-001",
      slBrokerBusinessDay: "20260320",
    });
    mockCancelOrder.mockResolvedValue({
      success: false,
      error: "Order already filled",
    });

    await cancelBrokerSL("pos-1");

    // 取消失敗でもフィールドはクリア（約定済みの場合など）
    expect(mockPrisma.tradingPosition.update).toHaveBeenCalledWith({
      where: { id: "pos-1" },
      data: {
        slBrokerOrderId: null,
        slBrokerBusinessDay: null,
      },
    });
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
    mockPrisma.tradingPosition.findUnique.mockResolvedValue({
      slBrokerOrderId: "SL-OLD",
      slBrokerBusinessDay: "20260320",
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
    expect(mockCancelOrder).toHaveBeenCalledWith("SL-OLD", "20260320");
    expect(mockSubmitOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        stopTriggerPrice: 980,
      }),
    );
  });
});
