import { describe, it, expect, vi } from "vitest";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/font/google", () => ({ Geist: () => ({ className: "geist" }) }));
vi.mock("./globals.css", () => ({}));
vi.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
}));
vi.mock("@/lib/i18n", () => ({
  LanguageProvider: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
}));
vi.mock("@/components/lock/AppLockGate", () => ({
  default: ({ children }: { children?: ReactNode }) => createElement("div", { "data-app-lock-gate": "" }, children),
}));

import RootLayout from "./layout";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

describe("RootLayout", () => {
  it("inlines the theme init script in the head", () => {
    const html = renderToStaticMarkup(createElement(RootLayout, null, null));

    expect(html).toContain(`<head><script>${THEME_INIT_SCRIPT}</script>`);
  });

  it("renders the page inside the app lock gate", () => {
    const html = renderToStaticMarkup(createElement(RootLayout, null, createElement("main", null, "PAGE")));

    expect(html).toContain('<div data-app-lock-gate=""><main>PAGE</main></div>');
  });
});
