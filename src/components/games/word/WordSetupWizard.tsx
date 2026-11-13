"use client";

import { useLang } from "@/lib/i18n";
import { playerColor } from "@/lib/imposter";
import {
  GAME_THEME,
  WORD_SETUP_ERROR_KEYS,
  WORD_SETUP_STEPS,
  validateWordSetup,
  wordStepErrors,
  type WordSetup,
} from "@/lib/word-game";
import WordRulesStep from "./WordRulesStep";
import WordTeamsStep from "./WordTeamsStep";
import WordWordsStep from "./WordWordsStep";

// The setup, one step at a time. The step lives in the parent so this component has no
// state of its own.
export default function WordSetupWizard({
  value,
  onChange,
  step,
  onStep,
  onStart,
  quickStart,
}: {
  value: WordSetup;
  onChange: (next: WordSetup) => void;
  /** Index into WORD_SETUP_STEPS. */
  step: number;
  onStep: (step: number) => void;
  onStart: () => void;
  /** A game was played on this device before: offer to skip the remaining steps. */
  quickStart: boolean;
}) {
  const { t } = useLang();
  const name = WORD_SETUP_STEPS[step];
  const last = step === WORD_SETUP_STEPS.length - 1;
  const allErrors = validateWordSetup(value);
  // The last step shows everything that still blocks Start, whichever step it belongs to.
  const errors = last ? allErrors : wordStepErrors(value, name);
  const titles = { teams: t.wordStepTeams, words: t.wordStepWords, rules: t.wordStepRules };
  const primary = "flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">{titles[name]}</h2>
        <div
          className="flex gap-1.5"
          role="img"
          aria-label={t.wordStep.replace("{n}", String(step + 1)).replace("{total}", String(WORD_SETUP_STEPS.length))}
        >
          {WORD_SETUP_STEPS.map((s, i) => (
            <span key={s} className={`h-2 w-2 rounded-full ${i === step ? "bg-white" : "bg-white/30"}`} />
          ))}
        </div>
      </div>

      {name === "teams" && <WordTeamsStep value={value} onChange={onChange} />}
      {name === "words" && <WordWordsStep value={value} onChange={onChange} />}
      {name === "rules" && <WordRulesStep value={value} onChange={onChange} />}

      {errors.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:text-amber-400">
          {errors.map((e) => (
            <li key={e}>{t[WORD_SETUP_ERROR_KEYS[e]]}</li>
          ))}
        </ul>
      )}

      <div className="flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => onStep(step - 1)}
            className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
          >
            {t.back}
          </button>
        )}
        {last ? (
          <button type="button" disabled={allErrors.length > 0} onClick={onStart} className={primary}>
            {t.wordStart}
          </button>
        ) : (
          <button type="button" disabled={errors.length > 0} onClick={() => onStep(step + 1)} className={primary}>
            {t.wordNext}
          </button>
        )}
      </div>

      {step === 0 && quickStart && allErrors.length === 0 && (
        <button
          type="button"
          onClick={onStart}
          className="w-full rounded-lg py-3 font-semibold"
          style={{ backgroundColor: playerColor(2), color: GAME_THEME.ink }}
        >
          {t.wordQuickStart}
        </button>
      )}
    </div>
  );
}
