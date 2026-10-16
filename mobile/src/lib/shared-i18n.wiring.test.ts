import { describe, it, expect } from "vitest";
import { useLang, LanguageProvider, translationsFor } from "@ptracker/shared/i18n";

// Proves the shared i18n module resolves through the mobile toolchain via the
// @ptracker/shared local package. We assert on the exported provider/hook
// identities rather than rendering, so the test stays in the node env with no
// React renderer. The language switcher that consumes these lands in Plan 3f.
describe("shared/i18n wiring (mobile)", () => {
  it("exposes the provider and hook", () => {
    expect(typeof LanguageProvider).toBe("function");
    expect(typeof useLang).toBe("function");
  });

  it("exposes the widget strings in both languages", () => {
    expect(translationsFor("en").widgetTitle).toBe("Upcoming payments");
    expect(translationsFor("tr").widgetTitle).toBe("Yaklaşan ödemeler");
    expect(translationsFor("tr").widgetMore.replace("{n}", "3")).toBe("+3 daha");
  });
});
