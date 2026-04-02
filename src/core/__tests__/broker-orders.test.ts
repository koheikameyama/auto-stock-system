import { describe, it, expect, vi, beforeEach } from "vitest";
import {
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

describe("syncBrokerOrderStatuses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("brokerOrderIdが設定されている注文がない場合は早期リターンする", async () => {
    const { prisma } = await import("../../lib/prisma");
    const { getTachibanaClient } = await import("../broker-client");

    vi.mocked(getTachibanaClient).mockReturnValue({
      isLoggedIn: vi.fn().mockReturnValue(true),
      request: vi.fn().mockResolvedValue({
        sResultCode: "0",
        sCLMID: "CLMOrderList",
        aOrderList: [],
      }),
    } as unknown as ReturnType<typeof getTachibanaClient>);

    vi.mocked(prisma.tradingOrder.findMany).mockResolvedValueOnce([]);

    await syncBrokerOrderStatuses();

    expect(prisma.tradingOrder.update).not.toHaveBeenCalled();
  });
});
