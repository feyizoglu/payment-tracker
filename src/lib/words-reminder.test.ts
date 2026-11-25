import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/push", () => ({ sendExpoPush: vi.fn() }));
vi.mock("@/lib/web-push", () => ({ sendWebPush: vi.fn() }));

import { sendExpoPush } from "@/lib/push";
import { sendWebPush } from "@/lib/web-push";
import { WORDS_REMINDER_SCREEN, WORDS_REMINDER_TITLE, WORDS_REMINDER_URL, sendWordsReminders, wordsReminderBody } from "@/lib/words-reminder";

type Row = Record<string, unknown>;

// A stand-in for the supabase builder: vocab_words is read in pages with `.range`,
// devices and subscriptions with `.in`, and deletes are recorded per table.
function makeDb(opts: {
  words?: Row[];
  devices?: Row[];
  subscriptions?: Row[];
  errors?: Record<string, { message: string }>;
  deleteError?: { message: string } | null;
}) {
  const deleted: Record<string, string[]> = {};
  const deleteCalls: [string, string[]][] = [];
  const ranges: [number, number][] = [];
  const filters: Record<string, unknown[]> = {};
  const rows: Record<string, Row[]> = {
    vocab_words: opts.words ?? [],
    devices: opts.devices ?? [],
    web_push_subscriptions: opts.subscriptions ?? [],
  };
  const db = {
    _deleted: deleted,
    _deleteCalls: deleteCalls,
    _ranges: ranges,
    _filters: filters,
    from(table: string) {
      const error = opts.errors?.[table] ?? null;
      const chain = {
        select: () => chain,
        is: (...args: unknown[]) => {
          filters[table] = args;
          return chain;
        },
        order: () => chain,
        range: async (from: number, to: number) => {
          ranges.push([from, to]);
          return { data: error ? null : rows[table].slice(from, to + 1), error };
        },
        in: async (_col: string, vals: string[]) => ({
          data: error ? null : rows[table].filter((r) => vals.includes(r.user_id as string)),
          error,
        }),
        delete: () => ({
          in: async (_col: string, vals: string[]) => {
            deleteCalls.push([table, [...vals]]);
            (deleted[table] ??= []).push(...vals);
            return { error: opts.deleteError ?? null };
          },
        }),
      };
      return chain;
    },
  };
  return db;
}

const word = (userId: string) => ({ user_id: userId });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendExpoPush).mockResolvedValue({ sent: 0, invalidTokens: [], errors: [] });
  vi.mocked(sendWebPush).mockResolvedValue({ sent: 0, expiredEndpoints: [], errors: [] });
});

describe("sendWordsReminders", () => {
  it("does nothing when nobody has a word left to learn", async () => {
    const db = makeDb({ words: [] });
    const summary = await sendWordsReminders(db as never);
    expect(summary.users).toBe(0);
    expect(db._filters.vocab_words).toEqual(["learned_at", null]);
    expect(sendExpoPush).not.toHaveBeenCalled();
    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it("tells each user how many words wait, on the phone and in Chrome, opening the review", async () => {
    const db = makeDb({
      words: [word("u-1"), word("u-1"), word("u-2")],
      devices: [{ user_id: "u-1", expo_push_token: "tok-1" }, { user_id: "u-3", expo_push_token: "tok-3" }],
      subscriptions: [
        { user_id: "u-2", endpoint: "https://push/a", p256dh: "p", auth: "a" },
        { user_id: "u-2", endpoint: "https://push/b", p256dh: "p", auth: "a" },
      ],
    });
    vi.mocked(sendExpoPush).mockResolvedValue({ sent: 1, invalidTokens: [], errors: [] });
    vi.mocked(sendWebPush).mockResolvedValue({ sent: 2, expiredEndpoints: [], errors: [] });
    const summary = await sendWordsReminders(db as never);
    expect(summary.users).toBe(2);
    expect(sendExpoPush).toHaveBeenCalledWith([
      { to: "tok-1", title: WORDS_REMINDER_TITLE, body: wordsReminderBody(2), data: { screen: WORDS_REMINDER_SCREEN } },
    ]);
    expect(sendWebPush).toHaveBeenCalledTimes(1);
    expect(sendWebPush).toHaveBeenCalledWith(
      [
        { endpoint: "https://push/a", p256dh: "p", auth: "a" },
        { endpoint: "https://push/b", p256dh: "p", auth: "a" },
      ],
      { title: WORDS_REMINDER_TITLE, body: wordsReminderBody(1), url: WORDS_REMINDER_URL }
    );
    expect(summary.push.sent).toBe(1);
    expect(summary.webPush.sent).toBe(2);
  });

  it("reads every page of words, not just the first thousand", async () => {
    const words = [...Array.from({ length: 1000 }, () => word("u-1")), word("u-2")];
    const db = makeDb({ words, subscriptions: [{ user_id: "u-1", endpoint: "e", p256dh: "p", auth: "a" }] });
    const summary = await sendWordsReminders(db as never);
    expect(db._ranges).toEqual([[0, 999], [1000, 1999]]);
    expect(summary.users).toBe(2);
    expect(vi.mocked(sendWebPush).mock.calls[0][1].body).toBe(wordsReminderBody(1000));
  });

  it("prunes tokens and endpoints the push services report dead", async () => {
    const db = makeDb({
      words: [word("u-1")],
      devices: [{ user_id: "u-1", expo_push_token: "tok-1" }],
      subscriptions: [{ user_id: "u-1", endpoint: "https://push/a", p256dh: "p", auth: "a" }],
    });
    vi.mocked(sendExpoPush).mockResolvedValue({ sent: 0, invalidTokens: ["tok-1"], errors: [] });
    vi.mocked(sendWebPush).mockResolvedValue({ sent: 0, expiredEndpoints: ["https://push/a"], errors: ["gone"] });
    const summary = await sendWordsReminders(db as never);
    expect(db._deleted).toEqual({ devices: ["tok-1"], web_push_subscriptions: ["https://push/a"] });
    expect(summary.webPush.errors).toEqual(["gone"]);
  });

  it("reports failed queries and prunes instead of throwing", async () => {
    const failedWords = await sendWordsReminders(makeDb({ errors: { vocab_words: { message: "down" } } }) as never);
    expect(failedWords.errors).toEqual(["vocab words query failed: down"]);
    expect(failedWords.users).toBe(0);

    vi.mocked(sendExpoPush).mockResolvedValue({ sent: 0, invalidTokens: ["tok-1"], errors: [] });
    vi.mocked(sendWebPush).mockResolvedValue({ sent: 0, expiredEndpoints: ["e"], errors: [] });
    const db = makeDb({
      words: [word("u-1")],
      devices: [{ user_id: "u-1", expo_push_token: "tok-1" }],
      subscriptions: [{ user_id: "u-1", endpoint: "e", p256dh: "p", auth: "a" }],
      deleteError: { message: "nope" },
    });
    const summary = await sendWordsReminders(db as never);
    expect(summary.push.errors).toEqual(["dead-token prune failed: nope"]);
    expect(summary.webPush.errors).toEqual(["expired web push prune failed: nope"]);

    const lookupsDown = await sendWordsReminders(
      makeDb({ words: [word("u-1")], errors: { devices: { message: "x" }, web_push_subscriptions: { message: "y" } } }) as never
    );
    expect(lookupsDown.push.errors).toEqual(["devices query failed: x"]);
    expect(lookupsDown.webPush.errors).toEqual(["web push subscriptions query failed: y"]);
  });

  it("adds up web push results across users and prunes every expired endpoint in one delete", async () => {
    const db = makeDb({
      words: [word("u-1"), word("u-2")],
      subscriptions: [
        { user_id: "u-1", endpoint: "https://push/a", p256dh: "p", auth: "a" },
        { user_id: "u-2", endpoint: "https://push/b", p256dh: "p", auth: "a" },
      ],
    });
    vi.mocked(sendWebPush)
      .mockResolvedValueOnce({ sent: 2, expiredEndpoints: ["https://push/a"], errors: [] })
      .mockResolvedValueOnce({ sent: 1, expiredEndpoints: ["https://push/b"], errors: [] });
    const summary = await sendWordsReminders(db as never);
    expect(sendWebPush).toHaveBeenCalledTimes(2);
    expect(summary.webPush.sent).toBe(3);
    expect(summary.webPush.expiredEndpoints).toEqual(["https://push/a", "https://push/b"]);
    expect(db._deleteCalls).toEqual([["web_push_subscriptions", ["https://push/a", "https://push/b"]]]);
  });

  it("reports a web push error shared by several users once", async () => {
    const db = makeDb({
      words: [word("u-1"), word("u-2")],
      subscriptions: [
        { user_id: "u-1", endpoint: "https://push/a", p256dh: "p", auth: "a" },
        { user_id: "u-2", endpoint: "https://push/b", p256dh: "p", auth: "a" },
      ],
    });
    vi.mocked(sendWebPush).mockResolvedValue({ sent: 0, expiredEndpoints: [], errors: ["VAPID keys missing"] });
    const summary = await sendWordsReminders(db as never);
    expect(sendWebPush).toHaveBeenCalledTimes(2);
    expect(summary.webPush.errors).toEqual(["VAPID keys missing"]);
  });

  it("reports the errors the Expo push service returns", async () => {
    const db = makeDb({ words: [word("u-1")], devices: [{ user_id: "u-1", expo_push_token: "tok-1" }] });
    vi.mocked(sendExpoPush).mockResolvedValue({ sent: 0, invalidTokens: [], errors: ["expo down"] });
    const summary = await sendWordsReminders(db as never);
    expect(summary.push.errors).toEqual(["expo down"]);
  });
});
