"use client";

import { useRef } from "react";
import { Volume2 } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { VOCAB_LEARNED_STREAK, senseGroups, type VocabSense, type VocabWord } from "@/lib/vocab";

export function StreakDots({ word }: { word: Pick<VocabWord, "streak" | "learned_at"> }) {
  if (word.learned_at) return <span className="text-emerald-700 dark:text-emerald-400" aria-label="learned">✓</span>;
  return (
    <span className="tracking-widest text-emerald-700 dark:text-emerald-400" aria-label={`${word.streak}/${VOCAB_LEARNED_STREAK}`}>
      {"●".repeat(word.streak) + "○".repeat(VOCAB_LEARNED_STREAK - word.streak)}
    </span>
  );
}

export function SenseList({ senses }: { senses: readonly VocabSense[] }) {
  return (
    <div className="space-y-3">
      {senseGroups(senses).map((g) => (
        <div key={g.pos}>
          <p className="text-xs font-semibold uppercase text-gray-500">{g.pos}</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-900">
            {g.senses.map((s, i) => (
              <li key={i}>
                {s.definition}
                {s.example ? <p className="italic text-gray-500">“{s.example}”</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

export function AudioButton({ url }: { url: string | null }) {
  const { t } = useLang();
  const audio = useRef<HTMLAudioElement | null>(null);
  if (!url) return null;
  return (
    <button
      type="button"
      aria-label={t.wordsListen}
      onClick={() => {
        audio.current ??= new Audio(url);
        audio.current.currentTime = 0;
        void audio.current.play().catch(() => undefined);
      }}
      className="rounded-full p-2 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400">
      <Volume2 size={20} />
    </button>
  );
}
