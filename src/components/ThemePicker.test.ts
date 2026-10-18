import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));
const theme = vi.hoisted(() => ({ readThemePref: vi.fn(), setThemePref: vi.fn() }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const i = hooks.index++;
      if (!(i in hooks.states)) hooks.states[i] = typeof initial === "function" ? initial() : initial;
      const set = (next: unknown) => {
        hooks.states[i] = typeof next === "function" ? next(hooks.states[i]) : next;
      };
      return [hooks.states[i], set];
    },
  };
});

vi.mock("lucide-react", () => ({ Monitor: () => null, Moon: () => null, Sun: () => null }));
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: { theme: "Theme", themeSystem: "System", themeLight: "Light", themeDark: "Dark" } }),
}));
vi.mock("@/lib/theme", () => theme);

import ThemePicker from "./ThemePicker";

type Props = Record<string, unknown> & { children?: unknown };

function render(): ReactElement<Props> {
  hooks.index = 0;
  return ThemePicker() as ReactElement<Props>;
}

function radios(tree: ReactElement<Props>): ReactElement<Props>[] {
  const group = (tree.props.children as ReactElement<Props>[])[1];
  return group.props.children as ReactElement<Props>[];
}

function checked(tree: ReactElement<Props>) {
  return Object.fromEntries(radios(tree).map((r) => [r.props.title, r.props["aria-checked"]]));
}

beforeEach(() => {
  hooks.states = [];
  theme.readThemePref.mockReset().mockReturnValue("system");
  theme.setThemePref.mockReset();
});

describe("ThemePicker", () => {
  it("marks only the stored choice as checked", () => {
    theme.readThemePref.mockReturnValue("light");

    expect(checked(render())).toEqual({ System: false, Light: true, Dark: false });
  });

  it("applies dark and moves the checked state to it on click", () => {
    const dark = radios(render()).find((r) => r.props.title === "Dark")!;

    (dark.props.onClick as () => void)();

    expect(theme.setThemePref).toHaveBeenCalledWith("dark");
    expect(checked(render())).toEqual({ System: false, Light: false, Dark: true });
  });
});
