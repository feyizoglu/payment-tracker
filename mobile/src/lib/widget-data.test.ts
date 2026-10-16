import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
vi.mock("./storage", () => ({ getToken: vi.fn() }));
vi.mock("./config", () => ({ getApiUrl: () => "https://api.test" }));

import { ApiError } from "./api";
import { loadWidgetData, type WidgetDeps } from "./widget-data";

const NOW = new Date(2026, 9, 16, 9, 0);
const RECURRING = {
  id: "r1",
  name: "Rent",
  currency: "TRY",
  user_id: "u1",
  team_id: null,
  day_of_month: 18,
  start_month: "2026-01-01",
  end_month: null,
  created_at: "2026-01-01T00:00:00Z",
  entries: [],
};

let store: Record<string, string>;
let deps: WidgetDeps;
const get = vi.fn();

beforeEach(() => {
  store = {};
  get.mockReset();
  get.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/recurring")) return [RECURRING];
    if (path === "/api/teams") return [];
    return [];
  });
  deps = {
    getToken: async () => "jwt",
    get,
    now: () => NOW,
    readCache: async () => store.widget ?? null,
    writeCache: async (v) => {
      store.widget = v;
    },
    clearCache: async () => {
      delete store.widget;
    },
  };
});

describe("loadWidgetData", () => {
  it("is signed-out with no token and clears the cache", async () => {
    store.widget = "old";
    deps.getToken = async () => null;
    expect(await loadWidgetData(deps)).toEqual({ kind: "signed-out" });
    expect(store.widget).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it("is signed-out on a 401 and clears the cache", async () => {
    store.widget = "old";
    get.mockRejectedValue(new ApiError(401, "unauthorized"));
    expect(await loadWidgetData(deps)).toEqual({ kind: "signed-out" });
    expect(store.widget).toBeUndefined();
  });

  it("is signed-out without caching when the session ends during the fetch", async () => {
    const tokens = ["jwt", null];
    deps.getToken = async () => tokens.shift() ?? null;
    expect(await loadWidgetData(deps)).toEqual({ kind: "signed-out" });
    expect(store.widget).toBeUndefined();
  });

  it("stays signed-out when clearing the cache fails", async () => {
    store.widget = JSON.stringify({ kind: "ok", items: [], moreCount: 0, people: {}, updatedAt: "x" });
    deps.getToken = async () => null;
    deps.clearCache = async () => {
      throw new Error("disk");
    };
    expect(await loadWidgetData(deps)).toEqual({ kind: "signed-out" });
  });

  it("returns items, people and the refresh time, and caches them", async () => {
    const state = await loadWidgetData(deps);
    expect(state.kind).toBe("ok");
    if (state.kind !== "ok") return;
    expect(state.items.map((i) => [i.name, i.dueDate])).toEqual([
      ["Rent", "2026-09-18"],
      ["Rent", "2026-10-18"],
    ]);
    expect(state.updatedAt).toBe(NOW.toISOString());
    expect(JSON.parse(store.widget)).toEqual(state);
  });

  it("tolerates a teams failure", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/api/teams") throw new ApiError(500, "boom");
      if (path.startsWith("/api/recurring")) return [RECURRING];
      return [];
    });
    expect((await loadWidgetData(deps)).kind).toBe("ok");
  });

  it("falls back to the cache on a network error", async () => {
    const cached = { kind: "ok", items: [], moreCount: 0, people: {}, updatedAt: "2026-10-15T08:00:00.000Z" };
    store.widget = JSON.stringify(cached);
    get.mockRejectedValue(new TypeError("Network request failed"));
    expect(await loadWidgetData(deps)).toEqual(cached);
  });

  it("is an error with no usable cache", async () => {
    store.widget = "{not json";
    get.mockRejectedValue(new TypeError("Network request failed"));
    expect(await loadWidgetData(deps)).toEqual({ kind: "error" });
  });
});
