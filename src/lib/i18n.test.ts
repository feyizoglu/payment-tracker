import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LanguageProvider, useLang } from "@/lib/i18n";

// The project's Vitest config only matches src/**/*.test.ts and runs in a node
// environment with no jsdom, so the two public exports of shared/i18n.tsx
// (LanguageProvider + useLang) are exercised by server-rendering a probe consumer
// with React.createElement (JSX can't live in a .ts file).

function Probe() {
  const { lang, t } = useLang();
  return createElement("span", null, `${lang}|${t.addPayment}`);
}

describe("LanguageProvider", () => {
  it("supplies the default English translations and language to consumers", () => {
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, null, createElement(Probe))
    );
    expect(html).toContain("en|Add Payment");
  });
});

describe("useLang", () => {
  it("exposes lang, a setLang function, and the translation table from context", () => {
    let ctx: ReturnType<typeof useLang> | undefined;
    function Capture() {
      ctx = useLang();
      return null;
    }
    renderToStaticMarkup(
      createElement(LanguageProvider, null, createElement(Capture))
    );
    expect(ctx?.lang).toBe("en");
    expect(typeof ctx?.setLang).toBe("function");
    expect(ctx?.t.getStarted).toBe("Get started with Google");
  });
});
