import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { startFrameLoop } from "@ptracker/shared/frame-loop";
import {
  TOWER_COLORS,
  TOWER_OVER_GUARD_MS,
  newTowerGame,
  stepTower,
  towerPause,
  towerTap,
  type TowerBook,
  type TowerState,
} from "@ptracker/shared/book-tower";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { TowerOverlay } from "@/components/games/tower/tower-overlay";
import { TowerWorld, useTowerView } from "@/components/games/tower/tower-world";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppLock } from "@/lib/app-lock-context";
import { leaveGameScreen, useConfirmLeave } from "@/lib/leave-game";
import { getStoredTowerBest, setStoredTowerBest } from "@/lib/book-tower-storage";
import { useGameOnScreen } from "@/lib/use-game-on-screen";
import { useSoloBest } from "@/lib/use-solo-best";

export default function TowerScreen() {
  const { t } = useLang();
  const pinReady = useEnterGameModeOnce();
  const onScreen = useGameOnScreen();
  const dark = useColorScheme() === "dark";
  const { lock } = useAppLock();
  const view = useTowerView();
  const live = useRef<TowerState>(newTowerGame());
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [shown, setShown] = useState<{ phase: TowerState["phase"]; score: number; perfect: boolean; stack: TowerBook[] }>({
    phase: live.current.phase,
    score: 0,
    perfect: false,
    stack: live.current.stack,
  });
  const { best, newBest, record, clearNewBest } = useSoloBest(getStoredTowerBest, setStoredTowerBest);
  const [guard, setGuard] = useState(false);

  const publish = useCallback(
    (next: TowerState) => {
      // Guard the game-over card from its first frame, so a late tap cannot reach its buttons.
      if (next.phase === "over" && live.current.phase !== "over") setGuard(true);
      live.current = next;
      view.sync(next);
      const perfect = next.perfect > 0;
      setShown((v) =>
        v.phase === next.phase && v.score === next.score && v.perfect === perfect && v.stack === next.stack
          ? v
          : { phase: next.phase, score: next.score, perfect, stack: next.stack }
      );
    },
    [view]
  );

  const fresh = useCallback(() => {
    publish(newTowerGame());
    clearNewBest();
    setGuard(false);
  }, [publish, clearNewBest]);

  useEffect(() => {
    if (!onScreen) publish(towerPause(live.current));
  }, [onScreen, shown.phase, publish]);

  // After a miss the loop runs on until the last falling piece is gone.
  useEffect(() => {
    if (shown.phase !== "playing" && shown.phase !== "over") return;
    return startFrameLoop((dt) => {
      const next = stepTower(live.current, dt);
      publish(next);
      return next.phase === "playing" || next.pieces.length > 0;
    });
  }, [shown.phase, publish]);

  useEffect(() => {
    if (shown.phase !== "over") return;
    const stop = record(live.current.score);
    const id = setTimeout(() => setGuard(false), TOWER_OVER_GUARD_MS);
    return () => {
      stop();
      clearTimeout(id);
    };
  }, [shown.phase]);

  const playing = shown.phase === "playing" || shown.phase === "paused";
  useConfirmLeave(playing);

  if (!pinReady) return <GamesPinSetup title={t.towerTitle} />;

  return (
    <GameScreen title={t.towerTitle} tone="game" scroll={false} nav={!playing} confirmBack={playing}>
      <Pressable
        className="flex-1 overflow-hidden rounded-2xl"
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        onPressIn={() => {
          const next = towerTap(live.current);
          if (next !== live.current) publish(next);
        }}>
        {size ? (
          <TowerWorld view={view} stack={shown.stack} sliding={playing} width={size.w} height={size.h} dark={dark} />
        ) : (
          <View />
        )}
        <TowerOverlay
          phase={shown.phase}
          score={shown.score}
          perfect={shown.perfect}
          best={best}
          newBest={newBest}
          guard={guard}
          ink={(dark ? TOWER_COLORS.dark : TOWER_COLORS.light).score}
          onAgain={fresh}
          onBack={() => leaveGameScreen(lock.gameMode)}
        />
      </Pressable>
    </GameScreen>
  );
}
