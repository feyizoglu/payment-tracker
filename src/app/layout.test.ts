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

import RootLayout from "./layout";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

describe("RootLayout", () => {
  it("inlines the theme init script in the head", () => {
    const html = renderToStaticMarkup(createElement(RootLayout, null, null));

    expect(html).toContain(`<head><script>${THEME_INIT_SCRIPT}</script>`);
  });
});
