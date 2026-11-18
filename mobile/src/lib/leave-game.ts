import { router, useIsFocused } from "expo-router";
import { useEffect } from "react";
import { Alert, BackHandler } from "react-native";

import { useLang, type Translations } from "@ptracker/shared/i18n";
import { useAppLock } from "@/lib/app-lock-context";
import { isGameDialogOpen, setGameDialogOpen } from "@/lib/game-dialog";

// Leaves a game screen the way its header back does. In game mode the games list is the root,
// so with no history it goes there instead of to Payments.
export function leaveGameScreen(gameMode: boolean) {
  if (router.canGoBack()) router.back();
  else router.replace(gameMode ? "/games" : "/");
}

// Leaving a game in progress throws it away: ask first. The game clocks stand still while it asks.
export function askToLeave(t: Translations, onLeave: () => void) {
  // A second back press before the first question takes focus would stack a second one, and
  // closing the first would start the clocks under it.
  if (isGameDialogOpen()) return;
  const close = () => setGameDialogOpen(false);
  setGameDialogOpen(true);
  Alert.alert(
    t.gameLeaveTitle,
    t.gameLeaveBody,
    [
      { text: t.cancel, style: "cancel", onPress: close },
      {
        text: t.gameLeaveConfirm,
        style: "destructive",
        // Leave first: closing first would start the clocks for the frames before the screen goes.
        onPress: () => {
          onLeave();
          close();
        },
      },
    ],
    { cancelable: true, onDismiss: close }
  );
}

// While `active`, Android's back button and back gesture ask before leaving the game. Only while
// this screen is on top: the game-mode PIN screen over it keeps its back. A screen that blocks
// back outright in a phase passes `active` false there, so the two never compete.
export function useConfirmLeave(active: boolean) {
  const { t } = useLang();
  const { lock } = useAppLock();
  const focused = useIsFocused();
  const gameMode = lock.gameMode;

  // A question left open when the game screen goes away would keep every game clock still.
  useEffect(() => () => setGameDialogOpen(false), []);

  useEffect(() => {
    if (!active || !focused) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      askToLeave(t, () => leaveGameScreen(gameMode));
      return true;
    });
    return () => sub.remove();
  }, [active, focused, t, gameMode]);
}
