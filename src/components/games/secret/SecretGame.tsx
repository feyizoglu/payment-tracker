"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bestAfter, newSessionBest, sessionRead } from "@/lib/best-score";
import { useLang, type Lang } from "@/lib/i18n";
import { readSavedBest, writeSavedBest } from "@/lib/saved-best";
import {
  SECRET_BEST_KEY,
  SECRET_COLORS,
  SECRET_END_GUARD_MS,
  keyMarks,
  newSecretRound,
  pickSecret,
  secretCardsFor,
  secretDelete,
  secretLetter,
  secretSeenKey,
  secretSubmit,
  secretType,
  type SecretRound,
} from "@/lib/secret-word";
import { WORD_CATEGORY_EMOJI, WORD_CATEGORY_LABEL_KEYS, fillTemplate, parseSavedSeen } from "@/lib/word-game";
import { SecretBoard, SecretKeyboard, SecretLegend, SecretResult } from "./SecretParts";

function readSeen(lang: Lang): string[] {
  try {
    return parseSavedSeen(localStorage.getItem(secretSeenKey(lang)));
  } catch {
    return [];
  }
}

function writeSeen(lang: Lang, seen: readonly string[]) {
  try {
    localStorage.setItem(secretSeenKey(lang), JSON.stringify(seen));
  } catch {
    // Private mode or full storage: words may just come back sooner.
  }
}

export default function SecretGame() {
  const { t, lang } = useLang();
  const live = useRef<SecretRound | null>(null);
  const [round, setRound] = useState<SecretRound | null>(null);
  const streak = useRef(0);
  const [shownStreak, setShownStreak] = useState(0);
  const session = useRef(newSessionBest());
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const endedAt = useRef(0);
  const [dark, setDark] = useState(false);

  const deal = useCallback((lang: Lang) => {
    const picked = pickSecret(secretCardsFor(lang), readSeen(lang), Math.random);
    writeSeen(lang, picked.seen);
    live.current = newSecretRound(picked.card, lang);
    setRound(live.current);
    setNewBest(false);
  }, []);

  const apply = useCallback((next: SecretRound) => {
    const prev = live.current;
    if (!prev || next === prev) return;
    live.current = next;
    setRound(next);
    if (prev.phase !== "playing" || next.phase === "playing") return;
    endedAt.current = Date.now();
    if (next.phase === "lost") {
      streak.current = 0;
      setShownStreak(0);
      return;
    }
    streak.current += 1;
    setShownStreak(streak.current);
    const after = bestAfter(streak.current, session.current, readSavedBest(SECRET_BEST_KEY));
    session.current = after.session;
    if (after.save !== null) writeSavedBest(SECRET_BEST_KEY, after.save);
    setNewBest(after.isNew);
    setBest(after.session.best);
  }, []);

  const press = useCallback(
    (key: string) => {
      const r = live.current;
      if (!r) return;
      if (key === "Enter") return apply(secretSubmit(r));
      if (key === "Backspace") return apply(secretDelete(r));
      const letter = secretLetter(key, r.lang);
      if (letter) apply(secretType(r, letter));
    },
    [apply]
  );

  const guarded = () => Date.now() - endedAt.current < SECRET_END_GUARD_MS;

  const next = useCallback(() => {
    const r = live.current;
    if (!r || r.phase === "playing" || Date.now() - endedAt.current < SECRET_END_GUARD_MS) return;
    deal(lang);
  }, [deal, lang]);

  useEffect(() => {
    // localStorage only exists in the browser: reading it during render would differ from the server's HTML.
    session.current = sessionRead(session.current, readSavedBest(SECRET_BEST_KEY));
    setBest(session.current.best);
    setDark(document.documentElement.classList.contains("dark"));
    if (!live.current) deal(lang);
  }, [deal, lang]);

  useEffect(() => {
    const html = document.documentElement;
    const observer = new MutationObserver(() => setDark(html.classList.contains("dark")));
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as Element | null)?.closest?.("input, textarea, select")) return;
      const r = live.current;
      if (!r) return;
      // A focused button or link takes Enter itself.
      if (e.key === "Enter" && (e.target as Element | null)?.closest?.("button, a")) return;
      if (r.phase !== "playing") {
        if (e.key !== "Enter" || e.repeat) return;
        e.preventDefault();
        next();
        return;
      }
      if (e.key === "Enter" && e.repeat) return;
      if (e.key === "Enter" || e.key === "Backspace" || secretLetter(e.key, r.lang)) {
        e.preventDefault();
        press(e.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, next]);

  if (!round) return <div className="h-[70vh]" />;

  const palette = dark ? SECRET_COLORS.dark : SECRET_COLORS.light;
  const category = round.card.category;
  return (
    <div className="mx-auto w-full max-w-md select-none space-y-3">
      <div className="flex items-center justify-between text-sm text-gray-700">
        <span>{fillTemplate(t.secretHint, { category: `${WORD_CATEGORY_EMOJI[category]} ${t[WORD_CATEGORY_LABEL_KEYS[category]]}` })}</span>
        <span className="font-semibold">{fillTemplate(t.secretStreak, { n: String(shownStreak) })}</span>
      </div>
      <SecretBoard round={round} palette={palette} />
      <SecretLegend palette={palette} />
      {round.phase === "playing" ? (
        <>
          <p className="h-5 text-center text-sm font-semibold text-gray-700">{round.short ? t.secretShort : ""}</p>
          <SecretKeyboard round={round} marks={keyMarks(round.guesses, round.card.word)} palette={palette} onKey={press} />
          <p className="text-center text-xs text-gray-400">{t.secretKeyHint}</p>
        </>
      ) : (
        <SecretResult
          round={round}
          streak={shownStreak}
          best={best}
          newBest={newBest}
          onNext={next}
          onBack={(e) => {
            if (guarded()) e.preventDefault();
          }}
        />
      )}
    </div>
  );
}
