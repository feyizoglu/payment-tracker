"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { CLUE_ERROR_KEYS, CLUE_MAX_LENGTH, GAME_THEME, validateClue } from "@/lib/clue-game";
import PassPhone from "../PassPhone";

// One clue giver's turn, on their colour. Mount it with a `key` per giver: the field must
// start empty, never with the last giver's clue in it.
export default function ClueWrite({
  giver,
  word,
  revealed,
  onReveal,
  onSubmit,
}: {
  giver: string;
  word: string;
  /** The giver tapped Show the word. */
  revealed: boolean;
  onReveal: () => void;
  onSubmit: (clue: string) => void;
}) {
  const { t } = useLang();
  const [clue, setClue] = useState("");
  const error = validateClue(clue);
  // An empty field only keeps Done disabled; the other errors are said.
  const said = error === "empty" ? null : error;

  return (
    <PassPhone name={giver} revealed={revealed} revealLabel={t.clueShowWord} onReveal={onReveal}>
      <div className="space-y-1">
        <p className="text-sm font-semibold opacity-80">{t.clueTheWord}</p>
        <p className="break-words text-4xl font-black">{word}</p>
      </div>
      <form
        className="space-y-3 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          if (error === null) onSubmit(clue);
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-semibold">{t.clueYourClue}</span>
          <input
            value={clue}
            onChange={(e) => setClue(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            maxLength={CLUE_MAX_LENGTH}
            aria-invalid={said !== null}
            className="block w-full rounded-lg bg-white/70 px-3 py-3 text-xl font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-black/40"
            style={{ color: GAME_THEME.ink }}
          />
        </label>
        <p className="text-xs opacity-80">{t.clueClueHint}</p>
        {said && (
          <p role="alert" className="text-sm font-semibold">
            {t[CLUE_ERROR_KEYS[said]]}
          </p>
        )}
        <button
          type="submit"
          disabled={error !== null}
          className="w-full rounded-lg py-3 font-semibold disabled:opacity-40"
          style={{ backgroundColor: GAME_THEME.bg, color: GAME_THEME.text }}
        >
          {t.clueDone}
        </button>
      </form>
    </PassPhone>
  );
}
