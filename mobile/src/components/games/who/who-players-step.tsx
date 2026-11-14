import { View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { WHO_MODES, defaultWordSetup, type WhoMode, type WhoSetup, type WordSetup } from "@ptracker/shared/who-game";
import { SetupPlayersStep } from "@/components/games/setup-players-step";
import { WordTeamsStep } from "@/components/games/word/word-teams-step";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

// Describe It's teams step edits a whole WordSetup but only touches its teams: it gets one
// built around ours, and only the teams come back.
function asWordSetup(setup: WhoSetup): WordSetup {
  return { ...defaultWordSetup([setup.teams[0].name, setup.teams[1].name]), teams: setup.teams };
}

export function WhoPlayersStep({
  value,
  onChange,
}: {
  value: WhoSetup;
  onChange: (next: WhoSetup) => void;
}) {
  const { t } = useLang();
  const labels = { solo: t.whoModeSolo, teams: t.whoModeTeams };

  return (
    <View className="gap-4">
      <SegmentedToggle
        label={t.whoMode}
        value={value.mode}
        options={WHO_MODES.map((mode) => ({ value: mode, label: labels[mode] }))}
        onChange={(mode) => onChange({ ...value, mode: mode as WhoMode })}
      />
      {value.mode === "solo" ? (
        <SetupPlayersStep value={value} onChange={onChange} />
      ) : (
        <WordTeamsStep value={asWordSetup(value)} onChange={(next) => onChange({ ...value, teams: next.teams })} />
      )}
    </View>
  );
}
