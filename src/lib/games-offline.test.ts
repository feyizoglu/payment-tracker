import { describe, it, expect, vi, afterEach } from "vitest";
import { GAMES_CACHE, GAMES_PAGES, prepareGamesOffline, staticAssetsIn, syncGamesCache } from "@/lib/games-offline";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sw = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8");
const ORIGIN = "https://paytrack.example";

describe("games offline helper", () => {
  it("uses the same cache name and pages as the service worker", () => {
    expect(sw).toContain(`const GAMES_CACHE = "${GAMES_CACHE}";`);
    expect(sw).toContain(`const GAMES_PAGES = ${JSON.stringify(GAMES_PAGES).replace(/,/g, ", ")};`);
  });

  it("keeps the three games pages in the second cache version", () => {
    expect(GAMES_PAGES).toEqual(["/games", "/games/imposter", "/games/word"]);
    expect(GAMES_CACHE).toBe("games-v2");
  });
});

describe("staticAssetsIn", () => {
  it("finds static files in plain attributes", () => {
    const html = `<link rel="stylesheet" href="/_next/static/css/app.css"><script src='/_next/static/chunks/main.js' async></script><a href="/dashboard">x</a>`;
    expect(staticAssetsIn(html)).toEqual(["/_next/static/css/app.css", "/_next/static/chunks/main.js"]);
  });

  it("finds static files inside the escaped RSC payload", () => {
    const html = String.raw`<script>self.__next_f.push([1,"2:I[\"123\",[\"/_next/static/chunks/imposter.js\",\"/_next/static/chunks/shared.js\"],\"default\"]\n"])</script>`;
    expect(staticAssetsIn(html)).toEqual(["/_next/static/chunks/imposter.js", "/_next/static/chunks/shared.js"]);
  });

  it("keeps query strings and decodes &amp;", () => {
    const html = `<script src="/_next/static/chunks/main.js?dpl=dpl_abc"></script><link href="/_next/static/css/app.css?dpl=dpl_abc&amp;v=2">`;
    expect(staticAssetsIn(html)).toEqual(["/_next/static/chunks/main.js?dpl=dpl_abc", "/_next/static/css/app.css?dpl=dpl_abc&v=2"]);
  });

  it("lists each file once, in order of first appearance", () => {
    const html = String.raw`<script src="/_next/static/chunks/b.js"></script><script src="/_next/static/chunks/a.js"></script><script>self.__next_f.push([1,"[\"/_next/static/chunks/b.js\"]"])</script>`;
    expect(staticAssetsIn(html)).toEqual(["/_next/static/chunks/b.js", "/_next/static/chunks/a.js"]);
  });
});

describe("syncGamesCache", () => {
  const pages: Record<string, string> = {
    "/games": `<script src="/_next/static/chunks/main.js?dpl=1"></script><link href="/_next/static/css/app.css?dpl=1">`,
    "/games/imposter": String.raw`<script src="/_next/static/chunks/main.js?dpl=1"></script><script>self.__next_f.push([1,"[\"/_next/static/chunks/imposter.js?dpl=1\"]"])</script>`,
    "/games/word": String.raw`<script src="/_next/static/chunks/main.js?dpl=1"></script><script>self.__next_f.push([1,"[\"/_next/static/chunks/word.js?dpl=1\"]"])</script>`,
  };
  const assets = [
    "/_next/static/chunks/main.js?dpl=1",
    "/_next/static/css/app.css?dpl=1",
    "/_next/static/chunks/imposter.js?dpl=1",
    "/_next/static/chunks/word.js?dpl=1",
  ];

  function fakeCache(initial: string[] = [], failing: string[] = []) {
    const store = new Map<string, Response>(initial.map((path) => [`${ORIGIN}${path}`, new Response("old")]));
    const cache = {
      put: vi.fn(async (key: string, response: Response) => {
        if (response.bodyUsed) throw new TypeError("Response body is already used");
        store.set(`${ORIGIN}${key}`, response);
      }),
      add: vi.fn(async (url: string) => {
        if (failing.includes(url)) throw new TypeError("Request failed");
        store.set(`${ORIGIN}${url}`, new Response("asset"));
      }),
      keys: vi.fn(async () => [...store.keys()].map((key) => new Request(key))),
      delete: vi.fn(async (request: Request) => store.delete(request.url)),
    };
    const paths = () => [...store.keys()].map((key) => key.slice(ORIGIN.length)).sort();
    return { cache, store, paths };
  }

  const fetchPage = (path: string) => Promise.resolve(new Response(pages[path], { status: 200 }));

  it("stores every games page and all their files, and drops files no page uses any more", async () => {
    const { cache, store, paths } = fakeCache(["/_next/static/chunks/old.js?dpl=0", "/games"]);

    await expect(syncGamesCache(cache, fetchPage)).resolves.toBe(true);

    expect(paths()).toEqual([...GAMES_PAGES, ...assets].sort());
    expect(await store.get(`${ORIGIN}/games/imposter`)!.text()).toBe(pages["/games/imposter"]);
    expect(cache.add).toHaveBeenCalledTimes(assets.length);
  });

  it("changes nothing when a page cannot be fetched", async () => {
    const { cache, paths } = fakeCache(["/games", "/_next/static/chunks/old.js"]);
    const failing = (path: string) =>
      path === "/games/imposter" ? Promise.reject(new TypeError("offline")) : fetchPage(path);

    await expect(syncGamesCache(cache, failing)).resolves.toBe(false);
    await expect(
      syncGamesCache(cache, (path) => Promise.resolve(new Response("down", { status: path === "/games" ? 503 : 200 })))
    ).resolves.toBe(false);

    expect(cache.add).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(cache.delete).not.toHaveBeenCalled();
    expect(paths()).toEqual(["/_next/static/chunks/old.js", "/games"]);
  });

  it("writes no page and prunes nothing when a file cannot be stored", async () => {
    const { cache } = fakeCache(["/games", "/_next/static/chunks/old.js"], ["/_next/static/chunks/imposter.js?dpl=1"]);

    await expect(syncGamesCache(cache, fetchPage)).resolves.toBe(false);

    expect(cache.add).toHaveBeenCalledTimes(assets.length);
    expect(cache.put).not.toHaveBeenCalled();
    expect(cache.delete).not.toHaveBeenCalled();
  });
});

describe("prepareGamesOffline", () => {
  function stubBrowser(register: () => Promise<unknown>) {
    const open = vi.fn(async () => ({ add: vi.fn(), put: vi.fn(), keys: vi.fn(async () => []), delete: vi.fn() }));
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("navigator", { serviceWorker: { register: vi.fn(register) } });
    vi.stubGlobal("caches", { open });
    vi.stubGlobal("window", { caches: { open } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    return { register: (navigator as unknown as { serviceWorker: { register: () => void } }).serviceWorker.register, open };
  }

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("registers the service worker and opens the games cache in production", async () => {
    const { register, open } = stubBrowser(async () => ({}));
    await prepareGamesOffline();
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    expect(open).toHaveBeenCalledWith("games-v2");
  });

  it("resolves without opening the cache when registration fails", async () => {
    const { open } = stubBrowser(async () => {
      throw new Error("blocked");
    });
    await expect(prepareGamesOffline()).resolves.toBeUndefined();
    expect(open).not.toHaveBeenCalled();
  });
});
