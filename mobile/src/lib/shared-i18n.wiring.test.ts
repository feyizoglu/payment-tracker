import { describe, it, expect } from "vitest";
import { useLang, LanguageProvider } from "@ptracker/shared/i18n";

// Proves the shared i18n module resolves through the mobile toolchain via the
// @ptracker/shared local package. We assert on the exported provider/hook
// identities rather than rendering, so the test stays in the node env with no
// React renderer. The language switcher that consumes these lands in Plan 3f.
describe("shared/i18n wiring (mobile)", () => {
  it("exposes the provider and hook", () => {
    expect(typeof LanguageProvider).toBe("function");
    expect(typeof useLang).toBe("function");
  });
});
