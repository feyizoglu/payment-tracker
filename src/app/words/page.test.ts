import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { act, createElement } from "react";
import type { VocabWord } from "@/lib/vocab";

const host = vi.hoisted(() => {
  const nodes: Array<{ type: string; props: Record<string, unknown> }> = [];
  const keep = (c: unknown): unknown =>
    Array.isArray(c) ? c.map(keep) : typeof c === "string" || typeof c === "number" ? null : c;
  const Host = ({ __type, ...props }: { __type: string; children?: unknown }) => {
    nodes.push({ type: __type, props });
    return keep(props.children) ?? null;
  };
  const wrap =
    (fn: (...args: unknown[]) => unknown) =>
    (type: unknown, props: Record<string, unknown>, ...rest: unknown[]) =>
      typeof type === "string" ? fn(Host, { ...props, __type: type }, ...rest) : fn(type, props, ...rest);
  return { nodes, wrap, Host };
});
const nav = vi.hoisted(() => {
  const push = vi.fn();
  const replace = vi.fn();
  // next/navigation hands out the same router on every render.
  return { push, replace, router: { push, replace }, id: "w1" };
});
const client = vi.hoisted(() => ({
  listWords: vi.fn(),
  addWord: vi.fn(),
  changeWord: vi.fn(),
  relookupWord: vi.fn(),
  deleteWord: vi.fn(),
}));

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsx: host.wrap(actual.jsx), jsxs: host.wrap(actual.jsxs) };
});
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<Record<string, (...args: unknown[]) => unknown>>();
  return { ...actual, jsxDEV: host.wrap(actual.jsxDEV) };
});
const session = vi.hoisted(() => ({ status: "authenticated" as "authenticated" | "unauthenticated" }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: session.status === "authenticated" ? { user: { id: "u-1" } } : null, status: session.status }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => nav.router,
  useParams: () => ({ id: nav.id }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: unknown }) =>
    createElement(host.Host as never, { __type: "a", href, ...rest }, children as never),
}));
vi.mock("@/components/events/EventsHeader", () => ({ default: () => null }));
vi.mock("@/lib/words-client", () => client);

import { LanguageProvider, translationsFor } from "@/lib/i18n";
import WordsPage from "@/app/words/page";
import WordCardPage from "@/app/words/[id]/page";
import WordsReviewPage from "@/app/words/review/page";

interface Root {
  render(node: unknown): void;
  unmount(): void;
}
const { createRoot } = createRequire(import.meta.url)("react-dom/client") as { createRoot: (c: unknown) => Root };
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const t = translationsFor("en");
let root: Root | null = null;

function container() {
  const noop = { addEventListener: () => undefined, removeEventListener: () => undefined };
  return { nodeType: 1, nodeName: "DIV", tagName: "DIV", ownerDocument: { nodeType: 9, ...noop }, ...noop };
}

function word(over: Partial<VocabWord>): VocabWord {
  return {
    id: "w1", user_id: "u-1", word: "budget", word_key: "budget", meaning_tr: "bütçe", ipa: "/ˈbʌdʒɪt/",
    audio_url: null, senses: [{ pos: "noun", definition: "money set aside", example: "a tight budget" }],
    lookup: "found", streak: 0, learned_at: null, reviewed_at: null, created_at: "2026-11-22T10:00:00Z", ...over,
  };
}

async function mount(page: () => unknown) {
  root = createRoot(container());
  await act(async () => root?.render(createElement(LanguageProvider, { initialLang: "en" }, createElement(page as never))));
}
function lastRender() {
  const i = host.nodes.findLastIndex((n) => n.type === "main");
  return host.nodes.slice(i);
}
const flat = (c: unknown): string => (Array.isArray(c) ? c.map(flat).join("") : typeof c === "string" || typeof c === "number" ? String(c) : "");
const text = () => lastRender().map((n) => flat(n.props.children)).filter(Boolean).join(" | ");
const find = (type: string, label: string) =>
  lastRender().find((n) => n.type === type && (flat(n.props.children) === label || n.props.placeholder === label || n.props["aria-label"] === label));
async function click(label: string) {
  const b = find("button", label);
  if (!b) throw new Error(`no button ${label} in ${text()}`);
  await act(async () => (b.props.onClick as () => void)());
}
async function type(placeholder: string, value: string) {
  await act(async () => (find("input", placeholder)!.props.onChange as (e: unknown) => void)({ target: { value } }));
}
async function submit() {
  const form = lastRender().find((n) => n.type === "form")!;
  await act(async () => (form.props.onSubmit as (e: unknown) => void)({ preventDefault: () => undefined }));
}

const browser = { confirm: (() => true) as (message: string) => boolean };

beforeEach(() => {
  host.nodes.length = 0;
  browser.confirm = () => true;
  const noop = { addEventListener: () => undefined, removeEventListener: () => undefined };
  vi.stubGlobal("window", { HTMLIFrameElement: class {}, confirm: (m: string) => browser.confirm(m), ...noop });
  vi.stubGlobal("document", { ...noop, documentElement: { classList: { contains: () => false } } });
  vi.clearAllMocks();
  nav.id = "w1";
  session.status = "authenticated";
  client.listWords.mockResolvedValue({
    ok: true,
    data: [word({}), word({ id: "w2", word: "thrive", word_key: "thrive", meaning_tr: null, learned_at: "2026-11-22T11:00:00Z", streak: 3 })],
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
});

describe("WordsPage", () => {
  it("shows the progress and the review link with the unlearned count", async () => {
    await mount(WordsPage);
    expect(text()).toContain("2 words · 1 learned");
    expect(lastRender().find((n) => n.type === "a" && n.props.href === "/words/review")).toBeTruthy();
    expect(text()).toContain("Review (1)");
  });

  it("filters to learned words", async () => {
    await mount(WordsPage);
    await click(t.wordsFilterLearned);
    const rows = lastRender().filter((n) => n.type === "a" && String(n.props.href).startsWith("/words/w"));
    expect(rows.map((n) => n.props.href)).toEqual(["/words/w2"]);
  });

  it("refuses an invalid word without calling the server", async () => {
    await mount(WordsPage);
    await type(t.wordsWordLabel, "abc1");
    await submit();
    expect(text()).toContain(t.wordsInvalidWord);
    expect(client.addWord).not.toHaveBeenCalled();
  });

  it("opens the new word's card after saving", async () => {
    client.addWord.mockResolvedValue({ ok: true, data: word({ id: "w9", word: "give up" }) });
    await mount(WordsPage);
    await type(t.wordsWordLabel, " give  up ");
    await type(t.wordsMeaningLabel, "vazgeçmek");
    await submit();
    expect(client.addWord).toHaveBeenCalledWith("give up", "vazgeçmek");
    expect(nav.push).toHaveBeenCalledWith("/words/w9");
  });

  it("opens the existing card for a word already in the list", async () => {
    client.addWord.mockResolvedValue({ ok: false, status: 409, code: "duplicate", error: "Already", word: word({ id: "w1" }) });
    await mount(WordsPage);
    await type(t.wordsWordLabel, "Budget");
    await submit();
    expect(nav.push).toHaveBeenCalledWith("/words/w1");
  });

  it("offers a retry when the list cannot be loaded", async () => {
    client.listWords.mockResolvedValueOnce({ ok: false, status: 0, code: undefined, error: "" });
    await mount(WordsPage);
    expect(text()).toContain(t.wordsLoadFailed);
    await click(t.wordsRetry);
    expect(client.listWords).toHaveBeenCalledTimes(2);
    expect(text()).toContain("2 words · 1 learned");
  });

  it("shows the server's invalid meaning error and stays on the list", async () => {
    client.addWord.mockResolvedValue({ ok: false, status: 400, code: "invalid_meaning", error: "x" });
    await mount(WordsPage);
    await type(t.wordsWordLabel, "budget");
    await submit();
    expect(text()).toContain(t.wordsInvalidMeaning);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("says nothing matches a search that finds no word", async () => {
    await mount(WordsPage);
    await type(t.wordsSearch, "zzz");
    expect(text()).toContain(t.wordsNoMatch);
    expect(lastRender().some((n) => n.type === "a" && String(n.props.href).startsWith("/words/w"))).toBe(false);
  });
});

describe("WordCardPage", () => {
  it("shows the word, its meaning, senses and the source", async () => {
    await mount(WordCardPage);
    expect(text()).toContain("budget");
    expect(text()).toContain("bütçe");
    expect(text()).toContain("money set aside");
    expect(text()).toContain(t.wordsSource);
  });

  it("saves an edited meaning", async () => {
    client.changeWord.mockResolvedValue({ ok: true, data: word({ meaning_tr: "ödenek" }) });
    await mount(WordCardPage);
    // The meaning itself is the edit button.
    const edit = lastRender().find((n) => n.type === "button" && n.props.className === "text-left")!;
    await act(async () => (edit.props.onClick as () => void)());
    await type(t.wordsMeaningLabel, "ödenek");
    await click(t.wordsSave);
    expect(client.changeWord).toHaveBeenCalledWith("w1", { meaningTr: "ödenek" });
    expect(text()).toContain("ödenek");
  });

  it("looks a missing word up again", async () => {
    client.listWords.mockResolvedValue({ ok: true, data: [word({ lookup: "not_found", senses: [] })] });
    client.relookupWord.mockResolvedValue({ ok: true, data: word({}) });
    await mount(WordCardPage);
    expect(text()).toContain(t.wordsLookupMissing);
    await click(t.wordsLookupRetry);
    expect(client.relookupWord).toHaveBeenCalledWith("w1", "budget");
    expect(client.changeWord).not.toHaveBeenCalled();
  });

  it("deletes after confirming and goes back to the list", async () => {
    client.deleteWord.mockResolvedValue({ ok: true, data: { ok: true } });
    await mount(WordCardPage);
    await click(t.wordsDelete);
    expect(client.deleteWord).toHaveBeenCalledWith("w1");
    expect(nav.push).toHaveBeenCalledWith("/words");
  });

  it("goes back to the list for a word that is not there", async () => {
    nav.id = "gone";
    await mount(WordCardPage);
    expect(nav.replace).toHaveBeenCalledWith("/words");
  });

  it("keeps the meaning editor open and says the word is gone when saving 404s", async () => {
    client.changeWord.mockResolvedValue({ ok: false, status: 404, code: "not_found", error: "" });
    await mount(WordCardPage);
    const edit = lastRender().find((n) => n.type === "button" && n.props.className === "text-left")!;
    await act(async () => (edit.props.onClick as () => void)());
    await type(t.wordsMeaningLabel, "ödenek");
    await click(t.wordsSave);
    expect(text()).toContain(t.wordsNotFound);
    expect(find("input", t.wordsMeaningLabel)).toBeTruthy();
  });

  it("shows the server error and stays on the card when deleting fails", async () => {
    client.deleteWord.mockResolvedValue({ ok: false, status: 500, code: undefined, error: "Server down" });
    await mount(WordCardPage);
    await click(t.wordsDelete);
    expect(text()).toContain("Server down");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("goes back to the list when the word was already deleted", async () => {
    client.deleteWord.mockResolvedValue({ ok: false, status: 404, code: "not_found", error: "Word not found" });
    await mount(WordCardPage);
    await click(t.wordsDelete);
    expect(nav.push).toHaveBeenCalledWith("/words");
  });

  it("offers a retry when the word cannot be loaded", async () => {
    client.listWords.mockResolvedValueOnce({ ok: false, status: 0, code: undefined, error: "" });
    await mount(WordCardPage);
    expect(text()).toContain(t.wordsLoadFailed);
    expect(text()).not.toContain("bütçe");
    await click(t.wordsRetry);
    expect(text()).toContain("bütçe");
  });

  it("marks a learned word as not learned", async () => {
    nav.id = "w2";
    client.changeWord.mockResolvedValue({ ok: true, data: word({ id: "w2", word: "thrive", word_key: "thrive", meaning_tr: null }) });
    await mount(WordCardPage);
    await click(t.wordsUnlearn);
    expect(client.changeWord).toHaveBeenCalledWith("w2", { unlearn: true });
  });

  it("does not delete when the confirmation is declined", async () => {
    browser.confirm = () => false;
    await mount(WordCardPage);
    await click(t.wordsDelete);
    expect(client.deleteWord).not.toHaveBeenCalled();
  });
});

describe("WordsReviewPage", () => {
  it("keeps an answer failure on screen for the rest of the round, and clears it for the next", async () => {
    client.listWords.mockResolvedValue({ ok: true, data: [word({}), word({ id: "w3", word: "thrive", word_key: "thrive" })] });
    client.changeWord
      .mockResolvedValueOnce({ ok: false, status: 0, code: undefined, error: "" })
      .mockResolvedValue({ ok: true, data: word({}) });
    await mount(WordsReviewPage);
    await click(t.wordsShow);
    await click(t.wordsDontKnow);
    await click(t.wordsShow);
    await click(t.wordsKnow);
    expect(text()).toContain(t.wordsAnswerFailed);
    await click(t.wordsAnotherRound);
    expect(text()).not.toContain(t.wordsAnswerFailed);
  });

  it("reveals, records the answer and ends with the round summary", async () => {
    client.listWords.mockResolvedValue({ ok: true, data: [word({ streak: 2 })] });
    client.changeWord.mockResolvedValue({ ok: true, data: word({ streak: 3 }) });
    await mount(WordsReviewPage);
    expect(text()).toContain("budget");
    expect(text()).not.toContain("bütçe");
    await click(t.wordsShow);
    expect(text()).toContain("bütçe");
    await click(t.wordsKnow);
    expect(client.changeWord).toHaveBeenCalledWith("w1", { answer: "know" });
    expect(text()).toContain("1 of 1 · 1 words learned");
  });

  it("keeps going and says so when an answer cannot be saved", async () => {
    client.listWords.mockResolvedValue({ ok: true, data: [word({}), word({ id: "w3", word: "thrive", word_key: "thrive" })] });
    client.changeWord.mockResolvedValue({ ok: false, status: 0, code: undefined, error: "" });
    await mount(WordsReviewPage);
    await click(t.wordsShow);
    await click(t.wordsDontKnow);
    expect(client.changeWord).toHaveBeenCalledWith("w1", { answer: "dontKnow" });
    expect(text()).toContain(t.wordsAnswerFailed);
    expect(text()).toContain("thrive");
  });

  it("says when there is nothing to review", async () => {
    client.listWords.mockResolvedValue({ ok: true, data: [word({ learned_at: "2026-11-22T11:00:00Z", streak: 3 })] });
    await mount(WordsReviewPage);
    expect(text()).toContain(t.wordsNothingToReview);
  });

  it("offers a retry when the words cannot be loaded", async () => {
    client.listWords.mockResolvedValueOnce({ ok: false, status: 0, code: undefined, error: "" });
    await mount(WordsReviewPage);
    expect(text()).toContain(t.wordsLoadFailed);
    expect(text()).not.toContain("budget");
    await click(t.wordsRetry);
    expect(text()).toContain("budget");
  });

  it("loads the words again for another round", async () => {
    client.listWords.mockResolvedValue({ ok: true, data: [word({})] });
    client.changeWord.mockResolvedValue({ ok: true, data: word({ streak: 1 }) });
    await mount(WordsReviewPage);
    await click(t.wordsShow);
    await click(t.wordsKnow);
    await click(t.wordsAnotherRound);
    expect(client.listWords).toHaveBeenCalledTimes(2);
  });
});

describe("signed out", () => {
  for (const [name, page] of [
    ["WordsPage", WordsPage],
    ["WordCardPage", WordCardPage],
    ["WordsReviewPage", WordsReviewPage],
  ] as const) {
    it(`${name} sends a signed-out visitor home without loading words`, async () => {
      session.status = "unauthenticated";
      await mount(page);
      expect(nav.replace).toHaveBeenCalledWith("/");
      expect(client.listWords).not.toHaveBeenCalled();
    });
  }
});
