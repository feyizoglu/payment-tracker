"use client";

import { useLang } from "@/lib/i18n";
import { WHO_MODES, defaultWordSetup, type WhoSetup, type WordSetup } from "@/lib/who-game";
import SetupPlayersStep from "../SetupPlayersStep";
import WordTeamsStep from "../word/WordTeamsStep";
import WhoChoice from "./WhoChoice";

// Describe It's teams step edits a whole WordSetup but only touches its teams: it gets one
// built around ours, and only the teams come back.
function asWordSetup(setup: WhoSetup): WordSetup {
  return { ...defaultWordSetup([setup.teams[0].name, setup.teams[1].name]), teams: setup.teams };
}

export default function WhoPlayersStep({
  value,
  onChange,
}: {
  value: WhoSetup;
  onChange: (next: WhoSetup) => void;
}) {
  const { t } = useLang();
  const labels = { solo: t.whoModeSolo, teams: t.whoModeTeams };

  return (
    <div className="space-y-4">
      <WhoChoice
        label={t.whoMode}
        options={WHO_MODES.map((mode) => ({ value: mode, label: labels[mode] }))}
        value={value.mode}
        onPick={(mode) => onChange({ ...value, mode })}
      />
      {value.mode === "solo" ? (
        <SetupPlayersStep value={value} onChange={onChange} />
      ) : (
        <WordTeamsStep value={asWordSetup(value)} onChange={(next) => onChange({ ...value, teams: next.teams })} />
      )}
    </div>
  );
}
