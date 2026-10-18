import { describe, it, expect } from "vitest";
import * as shim from "@/lib/i18n";
import * as shared from "../../shared/i18n";

// src/lib/i18n.tsx is a `export *` shim over shared/i18n.ts, so the web app only sees the
// shared module's public exports through it. This pins that wiring: a new export added to
// shared/i18n must reach the web app, and the shim must not shadow one with its own copy.

describe("@/lib/i18n → shared/i18n wiring", () => {
  it("re-exports every public value of the shared module", () => {
    for (const key of Object.keys(shared)) {
      expect(shim).toHaveProperty(key);
    }
  });

  it("re-exports the same function identities rather than local copies", () => {
    const s = shared as unknown as Record<string, unknown>;
    const w = shim as unknown as Record<string, unknown>;
    for (const key of Object.keys(shared)) {
      expect(w[key]).toBe(s[key]);
    }
  });

  it("exposes the provider and the hook the app mounts", () => {
    expect(typeof shim.LanguageProvider).toBe("function");
    expect(typeof shim.useLang).toBe("function");
  });

  it("has the event strings in both languages", () => {
    expect(shim.translationsFor("en").events).toBe("Events");
    expect(shim.translationsFor("tr").events).toBe("Etkinlikler");
  });
});
