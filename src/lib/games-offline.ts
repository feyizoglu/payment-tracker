// Keeps the games playable offline. The service worker caches games pages and static
// files it sees, but the files of the very first visit were loaded before it was in
// control, so the page stores them itself. Must match GAMES_CACHE / GAMES_PAGES in sw.js.
export const GAMES_CACHE = "games-v1";
export const GAMES_PAGES = ["/games", "/games/imposter"];

export function gamesCacheUrls(entries: { name: string }[], origin: string): string[] {
  const assets = new Set<string>();
  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry.name);
    } catch {
      continue;
    }
    if (url.origin === origin && url.pathname.startsWith("/_next/static/")) assets.add(url.pathname);
  }
  return [...GAMES_PAGES, ...assets];
}

export async function prepareGamesOffline(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("caches" in window)) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const urls = gamesCacheUrls(performance.getEntriesByType("resource"), window.location.origin);
    const cache = await caches.open(GAMES_CACHE);
    await cache.addAll(urls);
  } catch {
    // Offline play is a bonus: a failure here must never break the game.
  }
}
