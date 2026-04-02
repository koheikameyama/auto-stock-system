import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  submitOrder,
  cancelOrder,
  modifyOrder,
  getEffectiveBrokerMode,
  syncBrokerOrderStatuses,
} from "../broker-orders";

// prismaモック
vi.mock("../../lib/prisma", () => ({
  prisma: {
    tradingConfig: {
      findFirst: vi.fn(),
    },
    tradingOrder: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
  },
}));

// slackモック
vi.mock("../../lib/slack", () => ({
  notifySlack: vi.fn().mockResolvedValue(undefined),
}));

// broker-clientモック
vi.mock("../broker-client", () => ({
  getTachibanaClient: vi.fn().mockReturnValue({
    isLoggedIn: vi.fn().mockReturnValue(false),
    request: vi.fn(),
  }),
}));

describe("getEffectiveBrokerMode", () => {
  beforeEach(() => {
    vi.stubEnv("BROKER_MODE", "");
  });

  it("env変数がある場合はそれを返す", () => {
    vi.stubEnv("BROKER_MODE", "live");
    expect(getEffectiveBrokerMode()).toBe("live");
  });

  it("env変数がない場合はsimulationを返す", () => {
    vi.stubEnv("BROKER_MODE", "");
    expect(getEffectiveBrokerMode()).toBe("simulation");
  });
});

describe("submitOrder", () => {
  beforeEach(() => {
    vi.stubEnv("BROKER_MODE", "");
  });

  it("simulationモードでは即座に成功を返す", async () => {
    vi.stubEnv("BROKER_MODE", "simulation");

    const result = await submitOrder({
      ticker: "7203.T",
      side: "buy",
      quantity: 100,
      limitPrice: 2500,
    });

    expect(result.success).toBe(true);
  });
});

describe("cancelOrder", () => {
  it("simulationモードでは即座に成功を返す", async () => {
    vi.stubEnv("BROKER_MODE", "simulation");

    const result = await cancelOrder("12345", "20260320");
    expect(result.success).toBe(true);
  });
});

describe("modifyOrder", () => {
  it("simulationモードでは即座に成功を返す", async () => {
    vi.stubEnv("BROKER_MODE", "simulation");

    const result = await modifyOrder("12345", "20260320", { price: 2600 });
    expect(result.success).toBe(true);
  });
});

describe("syncBrokerOrderStatuses", () => {
  beforeEach(() => {
    vi.stubEnv("BROKER_MODE", "live");
  });

  it("brokerOrderIdが未設定のpending買い注文を自動キャンセルしSlackに通知する", async () => {
    const { prisma } = await import("../../lib/prisma");
    const { notifySlack } = await import("../../lib/slack");
    const { getTachibanaClient } = await import("../broker-client");

    vi.mocked(getTachibanaClient).mockReturnValue({
      isLoggedIn: vi.fn().mockReturnValue(true),
      request: vi.fn().mockResolvedValue({
        sResultCode: "0",
        aOrderList: [],
      }),
    } as ReturnType<typeof getTachibanaClient>);

    const orphanOrder = {
      id: "order-orphan-1",
      brokerOrderId: null,
      brokerBusinessDay: null,
      brokerStatus: null,
      status: "pending",
      side: "buy",
      stock: { tickerCode: "7203.T" },
    };

    vi.mocked(prisma.tradingOrder.findMany)
      .mockResolvedValueOnce([orphanOrder] as never) // orphan query
      .mockResolvedValueOnce([]); // existing sync query

    await syncBrokerOrderStatuses();

    expect(prisma.tradingOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-orphan-1" },
        data: { status: "cancelled" },
      }),
    );
    expect(notifySlack).toHaveBeenCalledWith(
      expect.objectContaining({ color: "danger" }),
    );
  });

  it("simulationモードではorphan検出をスキップする", async () => {
    vi.stubEnv("BROKER_MODE", "simulation");
    const { prisma } = await import("../../lib/prisma");

    vi.mocked(prisma.tradingOrder.findMany).mockClear();
    await syncBrokerOrderStatuses();

    expect(prisma.tradingOrder.findMany).not.toHaveBeenCalled();
  });
});
