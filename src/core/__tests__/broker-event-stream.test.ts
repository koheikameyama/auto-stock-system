import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseEventMessage,
  BrokerEventStream,
  resetBrokerEventStream,
  isBrokerConnectionWindow,
  msUntilNextConnectionWindow,
} from "../broker-event-stream";
import type { ExecutionEvent } from "../broker-event-stream";

// ========================================
// parseEventMessage
// ========================================

describe("parseEventMessage", () => {
  it("SOH区切りのキー・バリューペアをパースする", () => {
    const msg = "p_no\x011\x01p_cmd\x01KP";
    const result = parseEventMessage(msg);
    expect(result).toEqual({ p_no: "1", p_cmd: "KP" });
  });

  it("複数フィールドをパースする", () => {
    const msg =
      "p_no\x011\x01p_date\x012026.03.20-10:00:00.000\x01p_cmd\x01EC\x01p_order_number\x01123456\x01p_eigyou_day\x0120260320";
    const result = parseEventMessage(msg);
    expect(result).toEqual({
      p_no: "1",
      p_date: "2026.03.20-10:00:00.000",
      p_cmd: "EC",
      p_order_number: "123456",
      p_eigyou_day: "20260320",
    });
  });

  it("空文字列を処理する", () => {
    const result = parseEventMessage("");
    expect(result).toEqual({});
  });

  it("奇数個のパーツ（末尾にキーのみ）を処理する", () => {
    const msg = "p_no\x011\x01p_cmd";
    const result = parseEventMessage(msg);
    expect(result).toEqual({ p_no: "1" });
  });

  it("値が空文字のフィールドを処理する", () => {
    const msg = "p_no\x01\x01p_cmd\x01KP";
    const result = parseEventMessage(msg);
    expect(result).toEqual({ p_no: "", p_cmd: "KP" });
  });
});

// ========================================
// isBrokerConnectionWindow
// ========================================

describe("isBrokerConnectionWindow", () => {
  it("平日10:00 JSTはtrue", () => {
    // 2026-03-31 10:00 JST = 2026-03-31 01:00 UTC (火曜)
    const tue10am = new Date("2026-03-31T01:00:00Z");
    expect(isBrokerConnectionWindow(tue10am)).toBe(true);
  });

  it("平日07:00 JSTはtrue（境界）", () => {
    // 2026-03-30 07:00 JST = 2026-03-29 22:00 UTC (月曜)
    const mon7am = new Date("2026-03-29T22:00:00Z");
    expect(isBrokerConnectionWindow(mon7am)).toBe(true);
  });

  it("平日06:59 JSTはfalse（境界）", () => {
    // 2026-03-30 06:59 JST = 2026-03-29 21:59 UTC (月曜)
    const mon659am = new Date("2026-03-29T21:59:00Z");
    expect(isBrokerConnectionWindow(mon659am)).toBe(false);
  });

  it("平日18:00 JSTはfalse（境界）", () => {
    // 2026-03-31 18:00 JST = 2026-03-31 09:00 UTC (火曜)
    const tue6pm = new Date("2026-03-31T09:00:00Z");
    expect(isBrokerConnectionWindow(tue6pm)).toBe(false);
  });

  it("平日22:00 JSTはfalse", () => {
    // 2026-03-31 22:00 JST = 2026-03-31 13:00 UTC (火曜)
    const tue10pm = new Date("2026-03-31T13:00:00Z");
    expect(isBrokerConnectionWindow(tue10pm)).toBe(false);
  });

  it("土曜日はfalse", () => {
    // 2026-03-28 10:00 JST = 2026-03-28 01:00 UTC (土曜)
    const sat10am = new Date("2026-03-28T01:00:00Z");
    expect(isBrokerConnectionWindow(sat10am)).toBe(false);
  });

  it("日曜日はfalse", () => {
    // 2026-03-29 10:00 JST = 2026-03-29 01:00 UTC (日曜)
    const sun10am = new Date("2026-03-29T01:00:00Z");
    expect(isBrokerConnectionWindow(sun10am)).toBe(false);
  });
});

// ========================================
// msUntilNextConnectionWindow
// ========================================

describe("msUntilNextConnectionWindow", () => {
  it("平日の早朝なら同日07:00までの時間を返す", () => {
    // 2026-03-31 05:00 JST = 2026-03-30 20:00 UTC (火曜)
    const tue5am = new Date("2026-03-30T20:00:00Z");
    const ms = msUntilNextConnectionWindow(tue5am);
    // 05:00 → 07:00 = 2時間
    expect(ms).toBe(2 * 60 * 60 * 1000);
  });

  it("平日18:00以降なら翌営業日07:00までの時間を返す", () => {
    // 2026-03-31 19:00 JST = 2026-03-31 10:00 UTC (火曜)
    const tue7pm = new Date("2026-03-31T10:00:00Z");
    const ms = msUntilNextConnectionWindow(tue7pm);
    // 火曜19:00 → 水曜07:00 = 12時間
    expect(ms).toBe(12 * 60 * 60 * 1000);
  });

  it("金曜18:00以降なら翌月曜07:00までの時間を返す", () => {
    // 2026-03-27 19:00 JST = 2026-03-27 10:00 UTC (金曜)
    const fri7pm = new Date("2026-03-27T10:00:00Z");
    const ms = msUntilNextConnectionWindow(fri7pm);
    // 金曜19:00 → 月曜07:00 = 60時間
    expect(ms).toBe(60 * 60 * 60 * 1000);
  });
});

// ========================================
// BrokerEventStream
// ========================================

describe("BrokerEventStream", () => {
  let stream: BrokerEventStream;

  beforeEach(() => {
    resetBrokerEventStream();
    stream = new BrokerEventStream();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stream.disconnect();
    vi.useRealTimers();
  });

  describe("イベント振り分け", () => {
    it("KPメッセージでkeepaliveイベントを発火する", () => {
      const handler = vi.fn();
      stream.on("keepalive", handler);

      // handleMessage を直接テスト（WebSocket接続なし）
      const handleMessage = (stream as unknown as { handleMessage: (msg: string) => void }).handleMessage.bind(stream);
      handleMessage("p_no\x011\x01p_cmd\x01KP");

      expect(handler).toHaveBeenCalledOnce();
    });

    it("ECメッセージでexecutionイベントを発火する", () => {
      const handler = vi.fn();
      stream.on("execution", handler);

      const handleMessage = (stream as unknown as { handleMessage: (msg: string) => void }).handleMessage.bind(stream);
      handleMessage(
        "p_no\x011\x01p_cmd\x01EC\x01p_order_number\x01789012\x01p_eigyou_day\x0120260320",
      );

      expect(handler).toHaveBeenCalledOnce();
      const event: ExecutionEvent = handler.mock.calls[0][0];
      expect(event.orderNumber).toBe("789012");
      expect(event.businessDay).toBe("20260320");
      expect(event.raw.p_cmd).toBe("EC");
    });

    it("STメッセージでstatusイベントを発火する", () => {
      const handler = vi.fn();
      stream.on("status", handler);

      const handleMessage = (stream as unknown as { handleMessage: (msg: string) => void }).handleMessage.bind(stream);
      handleMessage("p_no\x011\x01p_cmd\x01ST");

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toEqual({
        type: "ST",
        fields: { p_no: "1", p_cmd: "ST" },
      });
    });

    it("SSメッセージでstatusイベントを発火する", () => {
      const handler = vi.fn();
      stream.on("status", handler);

      const handleMessage = (stream as unknown as { handleMessage: (msg: string) => void }).handleMessage.bind(stream);
      handleMessage("p_no\x011\x01p_cmd\x01SS");

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].type).toBe("SS");
    });

    it("USメッセージでstatusイベントを発火する", () => {
      const handler = vi.fn();
      stream.on("status", handler);

      const handleMessage = (stream as unknown as { handleMessage: (msg: string) => void }).handleMessage.bind(stream);
      handleMessage("p_no\x011\x01p_cmd\x01US");

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0].type).toBe("US");
    });

    it("p_cmdがないメッセージは無視する", () => {
      const keepaliveHandler = vi.fn();
      const executionHandler = vi.fn();
      const statusHandler = vi.fn();
      stream.on("keepalive", keepaliveHandler);
      stream.on("execution", executionHandler);
      stream.on("status", statusHandler);

      const handleMessage = (stream as unknown as { handleMessage: (msg: string) => void }).handleMessage.bind(stream);
      handleMessage("p_no\x011\x01p_date\x012026.03.20");

      expect(keepaliveHandler).not.toHaveBeenCalled();
      expect(executionHandler).not.toHaveBeenCalled();
      expect(statusHandler).not.toHaveBeenCalled();
    });
  });

  describe("EC イベント処理", () => {
    it("注文番号がないECイベントはexecutionを発火しない", () => {
      const handler = vi.fn();
      stream.on("execution", handler);

      const handleMessage = (stream as unknown as { handleMessage: (msg: string) => void }).handleMessage.bind(stream);
      handleMessage("p_no\x011\x01p_cmd\x01EC");

      expect(handler).not.toHaveBeenCalled();
    });

    it("sOrderNumberフィールドからも注文番号を取得できる", () => {
      const handler = vi.fn();
      stream.on("execution", handler);

      const handleMessage = (stream as unknown as { handleMessage: (msg: string) => void }).handleMessage.bind(stream);
      handleMessage(
        "p_no\x011\x01p_cmd\x01EC\x01sOrderNumber\x01555555\x01sEigyouDay\x0120260320",
      );

      expect(handler).toHaveBeenCalledOnce();
      const event: ExecutionEvent = handler.mock.calls[0][0];
      expect(event.orderNumber).toBe("555555");
      expect(event.businessDay).toBe("20260320");
    });
  });

  describe("接続状態", () => {
    it("初期状態では未接続", () => {
      expect(stream.isConnected()).toBe(false);
    });

    it("disconnect後は未接続", () => {
      stream.disconnect();
      expect(stream.isConnected()).toBe(false);
    });
  });
});
