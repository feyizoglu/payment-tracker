import { describe, it, expect, vi, afterEach } from "vitest";
import { DESKTOP_POINTER_QUERY, isDesktopPointer, subscribeDesktopPointer } from "@/lib/desktop-pointer";

function stubMatchMedia(matches: boolean) {
  const query = { matches, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const matchMedia = vi.fn(() => query);
  vi.stubGlobal("window", { matchMedia });
  return { query, matchMedia };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isDesktopPointer", () => {
  it("asks for a fine pointer that can hover", () => {
    const { matchMedia } = stubMatchMedia(true);
    expect(isDesktopPointer()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(DESKTOP_POINTER_QUERY);
    expect(DESKTOP_POINTER_QUERY).toBe("(hover: hover) and (pointer: fine)");
  });

  it("is false on a touch device", () => {
    stubMatchMedia(false);
    expect(isDesktopPointer()).toBe(false);
  });

  it("is false where matchMedia does not exist", () => {
    vi.stubGlobal("window", {});
    expect(isDesktopPointer()).toBe(false);
  });

  it("is false without a window", () => {
    expect(isDesktopPointer()).toBe(false);
  });
});

describe("subscribeDesktopPointer", () => {
  it("listens for changes and stops on unsubscribe", () => {
    const { query } = stubMatchMedia(true);
    const onChange = vi.fn();
    const unsubscribe = subscribeDesktopPointer(onChange);
    expect(query.addEventListener).toHaveBeenCalledWith("change", onChange);
    unsubscribe();
    expect(query.removeEventListener).toHaveBeenCalledWith("change", onChange);
  });

  it("does nothing where matchMedia does not exist", () => {
    vi.stubGlobal("window", {});
    expect(() => subscribeDesktopPointer(vi.fn())()).not.toThrow();
  });
});
