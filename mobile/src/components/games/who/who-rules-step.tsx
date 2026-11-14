import { View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { WHO_ROUND_CHOICES, WHO_TURN_SECONDS, fillTemplate, type WhoSetup } from "@ptracker/shared/who-game";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

export function WhoRulesStep({
  value,
  onChange,
}: {
  value: WhoSetup;
  onChange: (next: WhoSetup) => void;
}) {
  const { t } = useLang();
  return (
    <View className="gap-5">
      <SegmentedToggle
        label={t.whoTurnTime}
        value={String(value.turnSeconds)}
        options={WHO_TURN_SECONDS.map((n) => ({ value: String(n), label: fillTemplate(t.whoSeconds, { n: String(n) }) }))}
        onChange={(n) => onChange({ ...value, turnSeconds: Number(n) })}
      />
      <SegmentedToggle
        label={t.whoRounds}
        hint={value.mode === "solo" ? t.whoRoundsSolo : t.whoRoundsTeams}
        value={String(value.rounds)}
        options={WHO_ROUND_CHOICES.map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(n) => onChange({ ...value, rounds: Number(n) })}
      />
    </View>
  );
}
