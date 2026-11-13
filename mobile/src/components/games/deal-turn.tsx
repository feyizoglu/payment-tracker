import { useEffect, useState, type ReactNode } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { useLang } from "@ptracker/shared/i18n";
import { GAME_THEME, TAP_GUARD_MS } from "@ptracker/shared/imposter";
import { GameButton } from "@/components/games/game-button";

// One player's turn while the cards are dealt: the card shows only while it is held.
// Render it in a GameScreen with `scroll={false}` and the player's colour, and mount it with
// `key={turn}` so an open card can never carry over to the next player.
export function DealTurn({
  name,
  revealed,
  onReveal,
  onNext,
  children,
}: {
  name: string;
  /** The reducer accepted this player's reveal: they have seen their card. */
  revealed: boolean;
  onReveal: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  // Only a press that is still held is asked again: a card a screen reader opened stays open
  // without a finger on it, and must not open on its own when the guard ends.
  const [held, setHeld] = useState(false);

  const show = (byHold = false) => {
    if (!revealed) onReveal();
    setOpen(true);
    setHeld(byHold);
  };
  const hide = () => {
    setOpen(false);
    setHeld(false);
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") hide();
    });
    return () => sub.remove();
  }, []);

  // A hold that started inside the tap guard was ignored: ask once more when it has passed.
  useEffect(() => {
    if (!open || !held || revealed) return;
    const id = setTimeout(onReveal, TAP_GUARD_MS);
    return () => clearTimeout(id);
  }, [open, held, revealed, onReveal]);

  // The reducer ignores a reveal that comes too soon after the last tap. The card only
  // shows once the reveal was accepted, so "has seen it" and "may pass the phone on" never
  // disagree. Asking again after that would restart the tap guard and swallow Next.
  const shown = open && revealed;

  return (
    <View className="flex-1 justify-between gap-6 py-4">
      <View className="items-center gap-2">
        <Text className="text-center text-2xl font-bold" style={{ color: GAME_THEME.ink }}>
          {t.imposterPassTo.replace("{name}", () => name)}
        </Text>
        <Text className="text-center text-sm" style={{ color: GAME_THEME.ink, opacity: 0.8 }}>
          {t.imposterPassHint}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shown ? undefined : t.imposterHoldToSee}
        accessibilityActions={[{ name: "activate" }]}
        accessibilityLiveRegion="polite"
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName !== "activate") return;
          if (shown) hide();
          else show();
        }}
        onPressIn={() => show(true)}
        onPressOut={hide}
        className="min-h-64 flex-1 items-center justify-center rounded-3xl p-6"
        style={{ backgroundColor: GAME_THEME.bg }}>
        {shown ? (
          <Animated.View entering={FadeIn.duration(150)} style={{ alignItems: "center", gap: 8 }}>
            {children}
          </Animated.View>
        ) : (
          <Text className="text-lg font-semibold" style={{ color: GAME_THEME.muted }}>
            {t.imposterHoldToSee}
          </Text>
        )}
      </Pressable>
      <GameButton label={t.imposterNextPlayer} onPress={onNext} disabled={!revealed} />
    </View>
  );
}
