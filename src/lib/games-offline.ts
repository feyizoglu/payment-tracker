// Keeps the games playable offline. The page stores each games page together with every
// static file that page needs; the service worker only reads that cache. Must match
// GAMES_CACHE / GAMES_PAGES in sw.js.
export const GAMES_CACHE = "games-v2";
export const GAMES_PAGES = ["/games", "/games/imposter", "/games/word"];

// Stops at quotes, whitespace and the backslash that escapes quotes in the inline RSC payload.
const STATIC_ASSET = /\/_next\/static\/[^"'\s)\\<>]+/g;

export function staticAssetsIn(html: string): string[] {
  const found = (html.match(STATIC_ASSET) ?? []).map((url) => url.replace(/&amp;/g, "&"));
  return [...new Set(found)];
}

type GamesCache = Pick<Cache, "put" | "add" | "keys" | "delete">;

// All or nothing per run: a page is only stored once all of its files are, so a cached
// page is never left pointing at files that are missing.
export async function syncGamesCache(
  cache: GamesCache,
  fetchPage: (path: string) => Promise<Response>
): Promise<boolean> {
  let responses: Response[];
  let htmls: string[];
  try {
    responses = await Promise.all(GAMES_PAGES.map((path) => fetchPage(path)));
    if (responses.some((response) => !response.ok)) return false;
    htmls = await Promise.all(responses.map((response) => response.clone().text()));
  } catch {
    return false;
  }

  const assets = [...new Set(htmls.flatMap(staticAssetsIn))];
  const added = await Promise.allSettled(assets.map((url) => cache.add(url)));
  if (added.some((result) => result.status === "rejected")) return false;

  await Promise.all(GAMES_PAGES.map((path, i) => cache.put(path, responses[i])));

  const keep = new Set([...GAMES_PAGES, ...assets]);
  const stale = (await cache.keys()).filter((request) => {
    const url = new URL(request.url);
    return !keep.has(url.pathname + url.search);
  });
  await Promise.all(stale.map((request) => cache.delete(request)));
  return true;
}

export async function prepareGamesOffline(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("caches" in window)) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const cache = await caches.open(GAMES_CACHE);
    await syncGamesCache(cache, (path) => fetch(path, { cache: "no-store" }));
  } catch {
    // Offline play is a bonus: a failure here must never break the game.
  }
}
