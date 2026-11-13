import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, canGoOn, pickOptions, visitTask, type GameState } from "@ptracker/shared/wolf-game";
import { GameButton } from "@/components/games/game-button";
import { WolfPicker } from "@/components/games/wolf/wolf-picker";
import { WolfWitch } from "@/components/games/wolf/wolf-witch";

// The open half of a night visit, on the visitor's colour. The table can see it, so it is the
// same for every role: every living player, all alike, and a tap moves on to the held result.
export function WolfChoose({
  state,
  onPick,
  onHeal,
  onNext,
}: {
  state: GameState;
  onPick: (seat: number) => void;
  onHeal: () => void;
  onNext: () => void;
}) {
  const { t } = useLang();
  const night = state.night;
  const task = visitTask(state);
  if (!night || !task) return null;
  const names = state.setup.players;
  const seat = night.order[night.visit];
  const ink = { color: GAME_THEME.ink };

  return (
    <View className="gap-6 py-4">
      <Text className="text-center text-2xl font-bold" style={ink}>
        {names[seat]}
      </Text>
      {task === "witch" ? (
        <>
          <WolfWitch state={state} onHeal={onHeal} onPick={onPick} ink />
          <GameButton label={t.imposterNextPlayer} onPress={onNext} disabled={!canGoOn(state)} />
        </>
      ) : (
        <>
          <Text className="text-center text-xl font-bold" style={ink}>
            {t.wolfChoosePlayer}
          </Text>
          <WolfPicker options={pickOptions(state)} names={names} selected={null} onPick={onPick} />
        </>
      )}
    </View>
  );
}
