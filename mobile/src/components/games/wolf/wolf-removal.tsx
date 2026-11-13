import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  GAME_THEME,
  ROLE_NAME_KEYS,
  livingSeats,
  pendingShot,
  playerColor,
  type GameState,
} from "@ptracker/shared/wolf-game";
import { WolfPicker } from "@/components/games/wolf/wolf-picker";
import { WolfRulesButton } from "@/components/games/wolf/wolf-rules-button";
import { PrimaryButton } from "@/components/ui/primary-button";

// Who the night (the morning) or the vote removed, and a removed hunter's shot.
export function WolfRemoval({
  state,
  onShoot,
  onContinue,
  onRules,
}: {
  state: GameState;
  onShoot: (seat: number) => void;
  onContinue: () => void;
  onRules?: () => void;
}) {
  const { t } = useLang();
  const removal = state.removal;
  if (!removal) return null;
  const names = state.setup.players;
  const morning = state.phase === "morning";
  const { hunter, shot } = removal;
  const ink = { color: GAME_THEME.ink };
  const row = (seat: number) => (
    <View
      key={seat}
      className="flex-row items-center justify-between rounded-xl px-4 py-2.5"
      style={{ backgroundColor: playerColor(seat) }}>
      <Text className="text-base font-semibold" style={ink}>
        {names[seat]}
      </Text>
      {state.setup.showRoles ? (
        <Text className="text-base" style={ink}>
          {t[ROLE_NAME_KEYS[state.roles[seat]]]}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View className="gap-5">
      {onRules ? <WolfRulesButton onPress={onRules} /> : null}
      <Text className="text-center text-2xl font-bold text-gray-900">{morning ? t.wolfMorning : t.wolfVote}</Text>
      {removal.removed.length === 0 ? (
        <Text className="text-center text-base text-gray-900">{morning ? t.wolfNobodyRemoved : t.wolfNobodyVotedOut}</Text>
      ) : (
        <View className="gap-2">
          <Text className="text-sm font-medium text-gray-500">{morning ? t.wolfRemovedTonight : t.wolfVotedOut}</Text>
          {removal.removed.map(row)}
        </View>
      )}
      {hunter !== null ? (
        <View className="gap-3">
          <Text className="text-center text-base font-semibold text-gray-900">
            {shot === null
              ? t.wolfHunterShoots.replace("{name}", () => names[hunter])
              : t.wolfHunterShot.replace("{name}", () => names[hunter]).replace("{target}", () => names[shot])}
          </Text>
          {shot === null ? (
            <WolfPicker
              options={livingSeats(state).map((seat) => ({ seat, enabled: true }))}
              names={names}
              selected={null}
              onPick={onShoot}
            />
          ) : (
            row(shot)
          )}
        </View>
      ) : null}
      {!pendingShot(state) ? <PrimaryButton label={t.wolfContinue} onPress={onContinue} /> : null}
    </View>
  );
}
