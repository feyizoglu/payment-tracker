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

// `initialLang` is the branch the mobile app depends on: its screens are Turkish, so it
// mounts the provider with initialLang="tr" instead of the web app's English default.
function captureContext(initialLang?: "en" | "tr") {
  let ctx: ReturnType<typeof useLang> | undefined;
  function Capture() {
    ctx = useLang();
    return null;
  }
  renderToStaticMarkup(
    createElement(
      LanguageProvider,
      initialLang ? { initialLang } : null,
      createElement(Capture)
    )
  );
  return ctx!;
}

describe("LanguageProvider initialLang", () => {
  it('starts in Turkish when initialLang="tr"', () => {
    expect(captureContext("tr").lang).toBe("tr");
  });

  it('serves Turkish copy to consumers when initialLang="tr"', () => {
    const html = renderToStaticMarkup(
      createElement(LanguageProvider, { initialLang: "tr" }, createElement(Probe))
    );
    expect(html).toContain("tr|Ödeme Ekle");
  });

  it('still starts in English when initialLang="en" is passed explicitly', () => {
    const ctx = captureContext("en");
    expect(ctx.lang).toBe("en");
    expect(ctx.t.addPayment).toBe("Add Payment");
  });
});

describe("translation table parity", () => {
  it("has no Turkish key missing from the English table", () => {
    const en = Object.keys(captureContext("en").t).sort();
    const tr = Object.keys(captureContext("tr").t as Record<string, string>).sort();
    expect(tr.filter((k) => !en.includes(k))).toEqual([]);
  });

  it("has no English key missing from the Turkish table", () => {
    const en = Object.keys(captureContext("en").t).sort();
    const tr = Object.keys(captureContext("tr").t as Record<string, string>).sort();
    expect(en.filter((k) => !tr.includes(k))).toEqual([]);
  });

  it("has no empty or undefined translation value in either language", () => {
    for (const lang of ["en", "tr"] as const) {
      const t = captureContext(lang).t as Record<string, string>;
      const blank = Object.keys(t).filter((k) => !t[k] || typeof t[k] !== "string");
      expect(blank).toEqual([]);
    }
  });
});
