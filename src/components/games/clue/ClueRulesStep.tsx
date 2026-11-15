"use client";

import { useLang } from "@/lib/i18n";
import { CLUE_DECK_SIZES, CLUE_LEVELS, CLUE_LEVEL_KEYS, type ClueSetup } from "@/lib/clue-game";
import WhoChoice from "../who/WhoChoice";

export default function ClueRulesStep({
  value,
  onChange,
}: {
  value: ClueSetup;
  onChange: (next: ClueSetup) => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-5">
      <WhoChoice
        label={t.clueDeck}
        options={CLUE_DECK_SIZES.map((n) => ({ value: n, label: String(n) }))}
        value={value.deckSize}
        onPick={(deckSize) => onChange({ ...value, deckSize })}
      />
      <WhoChoice
        label={t.clueLevel}
        options={CLUE_LEVELS.map((level) => ({ value: level, label: t[CLUE_LEVEL_KEYS[level]] }))}
        value={value.level}
        onPick={(level) => onChange({ ...value, level })}
      />
    </div>
  );
}
