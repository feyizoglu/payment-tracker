"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import EventsHeader from "@/components/events/EventsHeader";
import { bestAfter, newSessionBest, sessionRead } from "@/lib/best-score";
import { useLang } from "@/lib/i18n";
import { readSavedBest, writeSavedBest } from "@/lib/saved-best";
import { fillTemplate } from "@/lib/word-game";
import {
  RACE_BEST_KEY,
  RACE_COMBO_SHOWN,
  RACE_FEEDBACK_MS,
  RACE_TICK_MS,
  nextRaceQuestion,
  pickRace,
  raceOver,
  raceTimeLeft,
  startRace,
  type RaceChoice,
  type RaceState,
} from "@/lib/word-race";
import { readRaceList, writeRaceList } from "@/lib/word-race-list";
import { listWords } from "@/lib/words-client";

export default function WordRacePage() {
  const { data, status } = useSession();
  const userId = (data?.user as { id?: string } | undefined)?.id ?? null;
  const { t } = useLang();
  const router = useRouter();
  const [race, setRace] = useState<RaceState | null>(null);
  const [now, setNow] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tooFew, setTooFew] = useState(false);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const session = useRef(newSessionBest());

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  useEffect(() => {
    // localStorage only exists in the browser: reading it during render would differ from the server's HTML.
    session.current = sessionRead(session.current, readSavedBest(RACE_BEST_KEY));
    setBest(session.current.best);
  }, []);

  const loaded = useCallback(
    (res: Awaited<ReturnType<typeof listWords>>) => {
      const fresh = res.ok && Array.isArray(res.data) ? res.data : null;
      if (fresh) writeRaceList(fresh);
      // The saved copy is only trusted for a known account: rows of another user must never be played.
      const words = fresh ?? (userId ? readRaceList(userId) : null);
      const at = Date.now();
      const next = words ? startRace(words, at) : null;
      setLoadFailed(words === null);
      setTooFew(words !== null && next === null);
      setRace(next);
      setNow(at);
    },
    [userId]
  );
  const again = () => {
    setLoadFailed(false);
    setNewBest(false);
    void listWords().then(loaded);
  };
  useEffect(() => {
    if (status === "authenticated") void listWords().then(loaded);
  }, [status, loaded]);

  const over = race !== null && raceOver(race, now);
  const playing = race !== null && !over;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow(Date.now()), RACE_TICK_MS);
    return () => clearInterval(id);
  }, [playing]);

  const picked = race?.picked ?? null;
  useEffect(() => {
    if (!picked) return;
    const id = setTimeout(() => setRace((s) => (s && !raceOver(s, Date.now()) ? nextRaceQuestion(s) : s)), RACE_FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [picked]);

  const score = race?.score ?? 0;
  useEffect(() => {
    if (!over) return;
    const after = bestAfter(score, session.current, readSavedBest(RACE_BEST_KEY));
    session.current = after.session;
    if (after.save !== null) writeSavedBest(RACE_BEST_KEY, after.save);
    setNewBest(after.isNew);
    setBest(after.session.best);
  }, [over, score]);

  function pick(id: string, at: number) {
    setRace((s) => (s ? pickRace(s, id, at) : s));
    setNow(at);
  }

  function choiceClass(c: RaceChoice): string {
    if (picked && race && c.id === race.question.id) return "bg-emerald-600 text-white";
    if (picked && c.id === picked.id) return "bg-red-600 text-white";
    return "border border-gray-200 bg-surface text-gray-900";
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <EventsHeader active="words" />
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <Link href="/words" className="text-sm text-gray-500">← {t.wordsBack}</Link>
        <h1 className="text-xl font-semibold text-gray-900">{t.wordRaceTitle}</h1>
        {loadFailed ? (
          <p className="text-sm text-gray-700">{t.wordsLoadFailed} <button type="button" onClick={again} className="font-semibold text-emerald-700 dark:text-emerald-400">{t.wordsRetry}</button></p>
        ) : null}
        {tooFew ? <p className="text-gray-700">{t.wordRaceNeedWords}</p> : null}
        {race && playing ? (
          <div className="space-y-4 rounded-xl bg-surface p-6">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-gray-900">{fillTemplate(t.wordRaceTime, { s: String(Math.ceil(raceTimeLeft(race, now) / 1000)) })}</span>
              {race.combo >= RACE_COMBO_SHOWN ? <span className="text-orange-600">{fillTemplate(t.wordRaceCombo, { n: String(race.combo) })}</span> : null}
              <span className="text-gray-900">{fillTemplate(t.wordRaceScore, { n: String(race.score) })}</span>
            </div>
            <p className="min-h-16 text-center text-lg text-gray-900">{race.question.clue}</p>
            <div className="grid grid-cols-2 gap-2">
              {race.question.choices.map((c) => (
                <button key={c.id} type="button" onClick={() => pick(c.id, Date.now())} className={`rounded-lg px-3 py-3 text-sm font-semibold ${choiceClass(c)}`}>
                  {c.word}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {race && over ? (
          <div className="space-y-3 rounded-xl bg-surface p-6 text-center">
            <p className="text-2xl font-bold text-gray-900">{fillTemplate(t.wordRaceScore, { n: String(race.score) })}</p>
            {newBest ? <p className="font-semibold text-emerald-700 dark:text-emerald-400">{t.wordRaceNewBest}</p> : null}
            <p className="text-sm text-gray-700">{fillTemplate(t.wordRaceBest, { n: String(best) })}</p>
            <p className="text-sm text-gray-700">{fillTemplate(t.wordRaceBestCombo, { n: String(race.bestCombo) })}</p>
            <div className="space-y-1 text-left">
              <p className="text-sm font-semibold text-gray-900">{race.missed.length > 0 ? t.wordRaceMissed : t.wordRaceNoMissed}</p>
              <ul className="space-y-1">
                {race.missed.map((id) => (
                  <li key={id} className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-900">{race.words.find((w) => w.id === id)?.word}</span> · {race.clues[id]}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2 pt-2">
              <Link href="/words" className="flex-1 rounded-lg border border-gray-200 py-2 text-sm">{t.wordsBack}</Link>
              <button type="button" onClick={again} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white">{t.wordRacePlayAgain}</button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
