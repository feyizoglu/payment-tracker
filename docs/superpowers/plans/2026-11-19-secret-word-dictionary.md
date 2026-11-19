# Secret Word Dictionary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Secret Word accepts only real words as guesses (roots only), per the spec's Words section.

**Architecture:** A build script turns two downloaded sources into one space-separated string per language in `shared/secret-word-dictionary/{tr,en}.ts`. The engine builds a `Set` per language on first use (word list plus answers) and refuses other guesses with a `notice` instead of using a try.

**Tech Stack:** TypeScript, tsx for the script, Vitest.

---

### Task 1: Builder and lists

**Files:** Create `shared/secret-word-dictionary/build.ts`, `scripts/secret-word/build-dictionary.ts`, `shared/secret-word-dictionary/NOTICE.md`, `LICENSE-zemberek.txt`, generated `tr.ts`, `en.ts`; test `src/lib/secret-word-dictionary.test.ts`.

- [ ] Download `master-dictionary.dict` (zemberek-nlp, `morphology/src/main/resources/tr/`) and `enable1.txt` (dolph/dictionary) to `/tmp`.
- [ ] Test `turkishRoots` (adds verb stems, skips function-word tags and capitalised entries, flattens â/î/û, Turkish upper case), `englishRoots` (drops -s/-es/-ies/-ves/-ed/-ing forms of other words, keeps CHAOS-like words), `wordsModule`, and the generated lists (sorted, unique, five letters of the alphabet).
- [ ] Implement, then run `npx tsx@4.23.15 scripts/secret-word/build-dictionary.ts /tmp/master.dict /tmp/enable1.txt` (tr 5344, en 5828).

### Task 2: Engine and screens

**Files:** Modify `shared/secret-word.ts`, `shared/i18n.ts`, `src/components/games/secret/SecretGame.tsx`, `mobile/src/app/games/secret.tsx` and their tests.

- [ ] Replace `short: boolean` with `notice: "short" | "unknown" | null`; add `secretIsWord`; `secretSubmit` refuses a non-word keeping the letters.
- [ ] `secretUnknown` text in `en` and `tr`, shown where the short note is.
- [ ] Tests use real words for wrong guesses; add the refused-word cases on both platforms.
- [ ] Full suites, tsc, eslint; push through `/push-gate:push`, PR, CI, merge, `eas update --channel preview`.
