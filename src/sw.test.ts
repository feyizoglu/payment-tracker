import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const source = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");
const ORIGIN = "https://paytrack.example";

type Handler = (event: unknown) => void;

type CacheMock = { addAll: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };

function loadWorker(
  windows: { url: string; focus: () => unknown; navigate?: (url: string) => Promise<unknown> }[] = [],
  net: {
    fetch?: (req: unknown) => Promise<unknown>;
    match?: (key: unknown) => Promise<unknown>;
    keys?: string[];
    keysError?: Error;
  } = {}
) {
  const handlers: Record<string, Handler> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue(windows);
  const claim = vi.fn().mockResolvedValue(undefined);
  const skipWaiting = vi.fn().mockResolvedValue(undefined);
  const cache: CacheMock = { addAll: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn(net.match ?? (() => Promise.resolve(undefined))),
    keys: net.keysError ? vi.fn().mockRejectedValue(net.keysError) : vi.fn().mockResolvedValue(net.keys ?? []),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn(net.fetch ?? (() => Promise.reject(new Error("offline"))));
  const self = {
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    skipWaiting,
    registration: { showNotification },
    location: { origin: ORIGIN },
    clients: { matchAll, openWindow, claim },
  };
  const ResponseStub = { error: () => ({ type: "error" }) };
  vm.runInNewContext(source, { self, URL, caches, fetch, Response: ResponseStub });
  return { handlers, showNotification, openWindow, matchAll, claim, skipWaiting, cache, caches, fetch };
}

describe("sw.js push handler", () => {
  it("shows the payload's title, body and url", () => {
    const { handlers, showNotification } = loadWorker();
    const waitUntil = vi.fn();

    handlers.push({
      data: { json: () => ({ title: "Reminder", body: "Rent due", url: "/dashboard?month=2026-11" }) },
      waitUntil,
    });

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith("Reminder", {
      body: "Rent due",
      icon: "/icons/icon-192.png",
      data: { url: "/dashboard?month=2026-11" },
    });
  });

  it("falls back to PayTrack and /dashboard without title or url", () => {
    const { handlers, showNotification } = loadWorker();

    handlers.push({ data: { json: () => ({ body: "Rent due" }) }, waitUntil: vi.fn() });

    expect(showNotification).toHaveBeenCalledWith("PayTrack", {
      body: "Rent due",
      icon: "/icons/icon-192.png",
      data: { url: "/dashboard" },
    });
  });

  it("ignores a payload that is not JSON", () => {
    const { handlers, showNotification } = loadWorker();
    const waitUntil = vi.fn();
    const event = {
      data: {
        json: () => {
          throw new SyntaxError("Unexpected token");
        },
      },
      waitUntil,
    };

    expect(() => handlers.push(event)).not.toThrow();
    expect(waitUntil).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it("ignores a push without data", () => {
    const { handlers, showNotification } = loadWorker();
    const waitUntil = vi.fn();

    expect(() => handlers.push({ data: null, waitUntil })).not.toThrow();
    expect(waitUntil).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });
});

describe("sw.js notificationclick handler", () => {
  const click = (url: string | undefined) => {
    const waitUntil = vi.fn();
    const close = vi.fn();
    return { event: { notification: { close, data: url === undefined ? {} : { url } }, waitUntil }, waitUntil, close };
  };

  it("closes the notification and focuses a window already on the target", async () => {
    const focus = vi.fn().mockResolvedValue(undefined);
    const other = vi.fn();
    const { handlers, openWindow, matchAll } = loadWorker([
      { url: `${ORIGIN}/`, focus: other },
      { url: `${ORIGIN}/dashboard?month=2026-11`, focus },
    ]);
    const { event, waitUntil, close } = click("/dashboard?month=2026-11");

    handlers.notificationclick(event);
    await waitUntil.mock.calls[0][0];

    expect(close).toHaveBeenCalledTimes(1);
    expect(matchAll).toHaveBeenCalledWith({ type: "window", includeUncontrolled: true });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("reuses an open window on another page by navigating it to the target", async () => {
    const focus = vi.fn();
    const navigate = vi.fn(async () => null);
    const { handlers, openWindow } = loadWorker([{ url: `${ORIGIN}/dashboard`, focus, navigate }]);
    const { event, waitUntil } = click("/dashboard?month=2026-11");

    handlers.notificationclick(event);
    await waitUntil.mock.calls[0][0];

    expect(navigate).toHaveBeenCalledWith(`${ORIGIN}/dashboard?month=2026-11`);
    expect(focus).toHaveBeenCalled();
    expect(openWindow).not.toHaveBeenCalled();
  });

  it("targets /dashboard when the notification has no url", async () => {
    const { handlers, openWindow } = loadWorker();
    const { event, waitUntil } = click(undefined);

    handlers.notificationclick(event);
    await waitUntil.mock.calls[0][0];

    expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/dashboard`);
  });
});

describe("sw.js lifecycle and uncontrolled tabs", () => {
  it("claims open pages on activate", async () => {
    const { handlers, claim } = loadWorker();
    const waitUntil = vi.fn();
    handlers.activate({ waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(claim).toHaveBeenCalled();
  });

  it("opens a new window when navigating an uncontrolled tab is refused", async () => {
    const focus = vi.fn();
    const navigate = vi.fn(async () => {
      throw new TypeError("not controlled");
    });
    const { handlers, openWindow } = loadWorker([{ url: `${ORIGIN}/dashboard`, focus, navigate }]);
    const close = vi.fn();
    const waitUntil = vi.fn();
    handlers.notificationclick({ notification: { close, data: { url: "/dashboard?month=2026-11" } }, waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(openWindow).toHaveBeenCalledWith(`${ORIGIN}/dashboard?month=2026-11`);
  });
});

describe("sw.js games offline cache", () => {
  const ok = (body: string) => ({ ok: true, body, clone: () => ({ ok: true, body }) });

  function fetchEvent(url: string, init: { method?: string; mode?: string } = {}) {
    let responded: Promise<unknown> | undefined;
    const waits: Promise<unknown>[] = [];
    const request = { url, method: init.method ?? "GET", mode: init.mode ?? "no-cors" };
    return {
      request,
      event: {
        request,
        respondWith: (p: Promise<unknown>) => {
          responded = p;
        },
        waitUntil: (p: Promise<unknown>) => {
          waits.push(p);
        },
      },
      responded: () => responded,
      settled: () => Promise.all(waits),
    };
  }

  it("activates at once on install without precaching anything", async () => {
    const { handlers, cache, caches, skipWaiting } = loadWorker();
    let wait: Promise<unknown> = Promise.resolve();
    handlers.install({ waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
    expect(skipWaiting).toHaveBeenCalled();
    expect(caches.open).not.toHaveBeenCalled();
    expect(cache.addAll).not.toHaveBeenCalled();
  });

  it("deletes old games caches on activate", async () => {
    const { handlers, caches } = loadWorker([], { keys: ["games-v1", "games-v2", "other"] });
    let wait: Promise<unknown> = Promise.resolve();
    handlers.activate({ waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
    expect(caches.delete).toHaveBeenCalledWith("games-v1");
    expect(caches.delete).not.toHaveBeenCalledWith("games-v2");
    expect(caches.delete).not.toHaveBeenCalledWith("other");
  });

  it("still claims open pages when the cache cleanup fails", async () => {
    const { handlers, claim } = loadWorker([], { keysError: new Error("SecurityError") });
    let wait: Promise<unknown> = Promise.resolve();
    handlers.activate({ waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
    expect(claim).toHaveBeenCalled();
  });

  it("serves a games page from the network without storing it", async () => {
    const page = ok("<html>");
    const { handlers, cache, caches } = loadWorker([], { fetch: () => Promise.resolve(page) });
    const e = fetchEvent(`${ORIGIN}/games/imposter`, { mode: "navigate" });
    handlers.fetch(e.event);
    expect(await e.responded()).toBe(page);
    await e.settled();
    expect(caches.open).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("falls back to the cached games page when offline", async () => {
    const cached = { body: "cached" };
    const { handlers, caches } = loadWorker([], {
      match: (key) => Promise.resolve(key === "/games" ? cached : undefined),
    });
    const e = fetchEvent(`${ORIGIN}/games?from=home`, { mode: "navigate" });
    handlers.fetch(e.event);
    expect(await e.responded()).toBe(cached);
    expect(caches.match).toHaveBeenCalledWith("/games");
  });

  it("answers with a network error when offline and the page was never cached", async () => {
    const { handlers } = loadWorker();
    const e = fetchEvent(`${ORIGIN}/games/imposter`, { mode: "navigate" });
    handlers.fetch(e.event);
    expect(await e.responded()).toEqual({ type: "error" });
  });

  it("serves a cached static file without going to the network", async () => {
    const cached = { body: "js" };
    const { handlers, fetch, caches } = loadWorker([], { match: () => Promise.resolve(cached) });
    const e = fetchEvent(`${ORIGIN}/_next/static/chunks/app.js?dpl=dpl_abc`);
    handlers.fetch(e.event);
    expect(await e.responded()).toBe(cached);
    expect(caches.match).toHaveBeenCalledWith(e.request);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches a static file that is not cached without storing it", async () => {
    const asset = ok("js");
    const { handlers, cache, caches, fetch } = loadWorker([], { fetch: () => Promise.resolve(asset) });
    const e = fetchEvent(`${ORIGIN}/_next/static/chunks/app.js`);
    handlers.fetch(e.event);
    expect(await e.responded()).toBe(asset);
    await e.settled();
    expect(fetch).toHaveBeenCalledWith(e.request);
    expect(caches.open).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("leaves API calls, other pages, other origins and non-GET requests alone", () => {
    const { handlers } = loadWorker();
    for (const [url, init] of [
      [`${ORIGIN}/api/payments`, {}],
      [`${ORIGIN}/dashboard`, { mode: "navigate" }],
      ["https://cdn.example/_next/static/x.js", {}],
      [`${ORIGIN}/games`, { method: "POST", mode: "navigate" }],
    ] as const) {
      const e = fetchEvent(url, init);
      handlers.fetch(e.event);
      expect(e.responded()).toBeUndefined();
    }
  });
});
