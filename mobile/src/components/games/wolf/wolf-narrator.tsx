import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  NARRATOR_LINE_KEYS,
  ROLE_NAME_KEYS,
  canGoOn,
  lineRemoved,
  narratorLine,
  pickOptions,
  type GameState,
} from "@ptracker/shared/wolf-game";
import { WolfPicker } from "@/components/games/wolf/wolf-picker";
import { WolfRulesButton } from "@/components/games/wolf/wolf-rules-button";
import { WolfWitch } from "@/components/games/wolf/wolf-witch";
import { PrimaryButton } from "@/components/ui/primary-button";

// The narrator's night, one line at a time. The narrator does not play, so the player
// buttons show every role.
export function WolfNarrator({
  state,
  onPick,
  onHeal,
  onNext,
  onRules,
}: {
  state: GameState;
  onPick: (seat: number) => void;
  onHeal: () => void;
  onNext: () => void;
  onRules: () => void;
}) {
  const { t } = useLang();
  const night = state.night;
  const line = narratorLine(state);
  if (!night || !line) return null;
  const names = state.setup.players;
  const removed = lineRemoved(state);
  const role = (seat: number) => t[ROLE_NAME_KEYS[state.roles[seat]]];
  const picker = (selected: number | null) => (
    <WolfPicker options={pickOptions(state)} names={names} selected={selected} onPick={onPick} note={role} />
  );
  const nothing = line === "witch" && !removed && !night.heal && night.poison === null;

  return (
    <View className="gap-5">
      <WolfRulesButton onPress={onRules} />
      <Text className="text-center text-sm text-gray-500">{t.wolfNightN.replace("{n}", String(night.number))}</Text>
      <Text className="text-center text-2xl font-bold text-gray-900">{t[NARRATOR_LINE_KEYS[line]]}</Text>
      {removed ? <Text className="text-center text-base text-gray-500">{t.wolfLineRemoved}</Text> : null}
      {line === "wolves" ? picker(night.victim) : null}
      {line === "seer" && !removed ? (
        <>
          {picker(night.seen)}
          {night.seen !== null ? (
            <Text className="text-center text-3xl font-bold text-gray-900" accessibilityLiveRegion="polite">
              {state.roles[night.seen] === "wolf" ? t.wolfIsWolf : t.wolfNotWolf}
            </Text>
          ) : null}
          <Text className="text-center text-sm text-gray-500">{t.wolfSeerThumb}</Text>
        </>
      ) : null}
      {line === "doctor" && !removed ? picker(night.protect) : null}
      {line === "witch" && !removed ? <WolfWitch state={state} onHeal={onHeal} onPick={onPick} note={role} /> : null}
      <PrimaryButton label={nothing ? t.wolfNothing : t.wolfNext} onPress={onNext} disabled={!canGoOn(state)} />
    </View>
  );
}
