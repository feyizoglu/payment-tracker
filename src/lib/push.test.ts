import { describe, it, expect, vi, afterEach } from "vitest";
import { sendExpoPush } from "./push";

afterEach(() => vi.unstubAllGlobals());

const okTicket = { status: "ok", id: "t1" };
const deadTicket = {
  status: "error",
  message: "device gone",
  details: { error: "DeviceNotRegistered" },
};

describe("sendExpoPush", () => {
  it("returns zero result for empty input without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendExpoPush([]);
    expect(res).toEqual({ sent: 0, invalidTokens: [], errors: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts ok tickets and collects DeviceNotRegistered tokens", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [okTicket, deadTicket] }), { status: 200 })
      )
    );
    const res = await sendExpoPush([
      { to: "ExponentPushToken[a]", title: "t", body: "b" },
      { to: "ExponentPushToken[b]", title: "t", body: "b" },
    ]);
    expect(res.sent).toBe(1);
    expect(res.invalidTokens).toEqual(["ExponentPushToken[b]"]);
    expect(res.errors).toEqual(["device gone"]);
  });

  it("records HTTP failure without throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("oops", { status: 500 }))
    );
    const res = await sendExpoPush([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]);
    expect(res.sent).toBe(0);
    expect(res.errors).toEqual(["HTTP 500"]);
  });

  it("records a network failure without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const res = await sendExpoPush([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]);
    expect(res.sent).toBe(0);
    expect(res.invalidTokens).toEqual([]);
    expect(res.errors).toEqual(["connection refused"]);
  });

  it("treats non-DeviceNotRegistered failures as errors, not invalid tokens", async () => {
    const genericErrorTicket = { status: "error", details: { error: "MessageTooBig" } };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [genericErrorTicket] }), { status: 200 })
      )
    );
    const res = await sendExpoPush([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]);
    expect(res.sent).toBe(0);
    expect(res.invalidTokens).toEqual([]);
    expect(res.errors).toEqual(["unknown push error"]);
  });

  it("reports an error for a 2xx response with no data array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    );
    const res = await sendExpoPush([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]);
    expect(res.sent).toBe(0);
    expect(res.invalidTokens).toEqual([]);
    expect(res.errors).toEqual(["malformed response body"]);
  });

  it("reports an error (without throwing) when the 2xx body is not valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not json", { status: 200 }))
    );
    const res = await sendExpoPush([{ to: "ExponentPushToken[a]", title: "t", body: "b" }]);
    expect(res.sent).toBe(0);
    expect(res.errors).toEqual(["malformed response body"]);
  });

  it("splits >100 messages into separate requests and maps dead tokens per chunk", async () => {
    // 101 messages → 2 chunks (100 + 1). The dead token is the last one, so it
    // must be resolved against the SECOND chunk's index 0, not a global index.
    const messages = Array.from({ length: 101 }, (_, i) => ({
      to: `ExponentPushToken[${i}]`,
      title: "t",
      body: "b",
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: Array(100).fill(okTicket) }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [deadTicket] }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendExpoPush(messages);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.sent).toBe(100);
    expect(res.invalidTokens).toEqual(["ExponentPushToken[100]"]);
  });
});
