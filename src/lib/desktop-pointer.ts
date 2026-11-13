// "Desktop" means a mouse-like primary pointer: fine and able to hover. Phones and tablets
// report a coarse pointer and get the hold-to-see card instead of the Show button.
export const DESKTOP_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

function canMatch(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

export function isDesktopPointer(): boolean {
  return canMatch() && window.matchMedia(DESKTOP_POINTER_QUERY).matches;
}

export function subscribeDesktopPointer(onChange: () => void): () => void {
  if (!canMatch()) return () => {};
  const query = window.matchMedia(DESKTOP_POINTER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
