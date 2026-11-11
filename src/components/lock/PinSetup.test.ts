import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

const hooks = vi.hoisted(() => ({ states: [] as unknown[], index: 0 }));

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
vi.mock("@/lib/i18n", () => ({
  useLang: () => ({ t: { pinInvalid: "INVALID", pinMismatch: "MISMATCH", pinNew: "", pinRepeat: "", pinSave: "" } }),
}));

import PinSetup from "./PinSetup";

type Props = Record<string, unknown> & { children?: unknown };
type Node = ReactElement<Props>;

const onDone = vi.fn();

function render(): Node {
  hooks.index = 0;
  return PinSetup({ onDone }) as Node;
}

function nodes(node: unknown): Node[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as Node;
  return [el, ...nodes(el.props.children)];
}

function text(node: unknown): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  return text((node as Node).props.children);
}

async function submit(pin: string, repeat: string) {
  const [first, second] = nodes(render()).filter((n) => n.type === "input");
  (first.props.onChange as (e: unknown) => void)({ target: { value: pin } });
  (second.props.onChange as (e: unknown) => void)({ target: { value: repeat } });
  const form = render();
  await (form.props.onSubmit as (e: unknown) => Promise<void>)({ preventDefault: () => undefined });
  return text(render());
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.states = [];
});

describe("PinSetup submit", () => {
  it("rejects a PIN shorter than four digits", async () => {
    expect(await submit("123", "123")).toContain("INVALID");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("rejects a repeat that does not match", async () => {
    expect(await submit("1234", "1235")).toContain("MISMATCH");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("hands over a valid matching PIN", async () => {
    await submit("1234", "1234");
    expect(onDone).toHaveBeenCalledWith("1234");
  });
});
