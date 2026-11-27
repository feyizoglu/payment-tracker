import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabaseAdmin: vi.fn() }));
vi.mock("@/lib/words-reminder", () => ({ sendWordsReminders: vi.fn() }));

import { supabaseAdmin } from "@/lib/supabase";
import { sendWordsReminders } from "@/lib/words-reminder";
import { GET } from "./route";

const req = (auth?: string) =>
  new Request("http://localhost/api/cron/send-words-reminders", {
    headers: auth ? { authorization: auth } : {},
  });

const db = { from: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s3cret";
  vi.mocked(supabaseAdmin).mockReturnValue(db as never);
  vi.mocked(sendWordsReminders).mockResolvedValue({
    users: 0,
    push: { sent: 0, invalidTokens: [], errors: [] },
    webPush: { sent: 0, expiredEndpoints: [], errors: [] },
    errors: [],
  });
});

describe("GET /api/cron/send-words-reminders", () => {
  it("401s without the CRON_SECRET bearer token", async () => {
    const res = await GET(req("Bearer wrong") as never);
    expect(res.status).toBe(401);
    expect(supabaseAdmin).not.toHaveBeenCalled();
    expect(sendWordsReminders).not.toHaveBeenCalled();
  });

  it("401s with no authorization header", async () => {
    const res = await GET(req() as never);
    expect(res.status).toBe(401);
    expect(sendWordsReminders).not.toHaveBeenCalled();
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])("401s when CRON_SECRET is %s, even for a 'Bearer undefined' header", async (_label, secret) => {
    if (secret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = secret;
    for (const auth of ["Bearer undefined", "Bearer ", undefined]) {
      const res = await GET(req(auth) as never);
      expect(res.status).toBe(401);
    }
    expect(supabaseAdmin).not.toHaveBeenCalled();
    expect(sendWordsReminders).not.toHaveBeenCalled();
  });

  it("sends the My Words nudge and returns its summary", async () => {
    vi.mocked(sendWordsReminders).mockResolvedValue({
      users: 4,
      push: { sent: 3, invalidTokens: [], errors: [] },
      webPush: { sent: 1, expiredEndpoints: [], errors: [] },
      errors: [],
    });
    const res = await GET(req("Bearer s3cret") as never);
    expect(res.status).toBe(200);
    expect(sendWordsReminders).toHaveBeenCalledWith(db);
    expect(await res.json()).toMatchObject({ users: 4, push: { sent: 3 }, webPush: { sent: 1 } });
  });

  it("returns 500 with the summary and logs it when the word count fails, so the skipped nudge shows red", async () => {
    vi.mocked(sendWordsReminders).mockResolvedValue({
      users: 0,
      push: { sent: 0, invalidTokens: [], errors: ["expo down"] },
      webPush: { sent: 0, expiredEndpoints: [], errors: ["web push down"] },
      errors: ["vocab words query failed: x"],
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET(req("Bearer s3cret") as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ users: 0, errors: ["vocab words query failed: x"] });
    expect(logged).toHaveBeenCalledWith("words reminders:", "vocab words query failed: x; expo down; web push down");
    logged.mockRestore();
  });

  it("keeps 200 but logs per-channel push errors, as the nudge still went out on the other channels", async () => {
    vi.mocked(sendWordsReminders).mockResolvedValue({
      users: 2,
      push: { sent: 1, invalidTokens: [], errors: ["expo down"] },
      webPush: { sent: 0, expiredEndpoints: [], errors: ["web push down"] },
      errors: [],
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET(req("Bearer s3cret") as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ users: 2, push: { sent: 1 } });
    expect(logged).toHaveBeenCalledWith("words reminders:", "expo down; web push down");
    logged.mockRestore();
  });

  it("does not log when the nudge has no errors", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await GET(req("Bearer s3cret") as never);
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("returns 500 with the message and logs it when the nudge throws", async () => {
    vi.mocked(sendWordsReminders).mockRejectedValue(new Error("boom"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET(req("Bearer s3cret") as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
    expect(logged).toHaveBeenCalledWith("words reminders:", "boom");
    logged.mockRestore();
  });

  it("reports a generic message when the nudge throws a non-Error", async () => {
    vi.mocked(sendWordsReminders).mockRejectedValue("nope");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await GET(req("Bearer s3cret") as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "words reminders failed" });
    vi.mocked(console.error).mockRestore();
  });
});
