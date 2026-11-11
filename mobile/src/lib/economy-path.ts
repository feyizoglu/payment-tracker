const ECONOMY_PATHS = new Set(["/economy", "/asset-form", "/manual-gold"]);
const ASSET_DETAIL = /^\/asset\/[^/]+$/;

export function isEconomyPath(path: string): boolean {
  return ECONOMY_PATHS.has(path) || ASSET_DETAIL.test(path);
}
