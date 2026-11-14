"use client";

import { useLang } from "@/lib/i18n";
import { WHO_ROUND_CHOICES, WHO_TURN_SECONDS, fillTemplate, type WhoSetup } from "@/lib/who-game";
import WhoChoice from "./WhoChoice";

export default function WhoRulesStep({
  value,
  onChange,
}: {
  value: WhoSetup;
  onChange: (next: WhoSetup) => void;
}) {
  const { t } = useLang();
  return (
    <div className="space-y-5">
      <WhoChoice
        label={t.whoTurnTime}
        options={WHO_TURN_SECONDS.map((n) => ({ value: n, label: fillTemplate(t.whoSeconds, { n: String(n) }) }))}
        value={value.turnSeconds}
        onPick={(turnSeconds) => onChange({ ...value, turnSeconds })}
      />
      <WhoChoice
        label={t.whoRounds}
        hint={value.mode === "solo" ? t.whoRoundsSolo : t.whoRoundsTeams}
        options={WHO_ROUND_CHOICES.map((n) => ({ value: n, label: String(n) }))}
        value={value.rounds}
        onPick={(rounds) => onChange({ ...value, rounds })}
      />
    </div>
  );
}
