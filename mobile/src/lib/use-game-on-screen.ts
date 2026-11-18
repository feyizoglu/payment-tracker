import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

// False while the app is in the background, the phone is locked or the game-mode PIN screen
// covers the game, which stays mounted under it. A game clock stands still while it is false.
export function useGameOnScreen(): boolean {
  const focused = useIsFocused();
  // The game only mounts after a tap, so a state not reported yet counts as active.
  const [appActive, setAppActive] = useState(
    () => AppState.currentState !== "background" && AppState.currentState !== "inactive"
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setAppActive(next === "active"));
    return () => sub.remove();
  }, []);

  return focused && appActive;
}
