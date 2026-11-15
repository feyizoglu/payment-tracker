"use client";

import { useLang } from "@/lib/i18n";
import { SCALE_TURN_CHOICES, type ScaleSetup } from "@/lib/scale-game";
import WhoChoice from "../who/WhoChoice";

export default function ScaleRulesStep({
  value,
  onChange,
}: {
  value: ScaleSetup;
  onChange: (next: ScaleSetup) => void;
}) {
  const { t } = useLang();
  return (
    <WhoChoice
      label={t.scaleTurns}
      hint={t.scaleTurnsHint}
      options={SCALE_TURN_CHOICES.map((n) => ({ value: n, label: String(n) }))}
      value={value.turns}
      onPick={(turns) => onChange({ ...value, turns })}
    />
  );
}
