import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { startFrameLoop } from "@ptracker/shared/frame-loop";
import {
  PLANE_COLORS,
  PLANE_OVER_GUARD_MS,
  newPlaneGame,
  planeBestAfter,
  planePause,
  planeTap,
  planeWorldWidth,
  stepPlane,
  type PlaneState,
} from "@ptracker/shared/paper-plane";
import { GamesPinSetup, useEnterGameModeOnce } from "@/components/games/game-mode-entry";
import { GameScreen } from "@/components/games/game-screen";
import { PlaneOverlay } from "@/components/games/plane/plane-overlay";
import { PlaneWorld, usePlaneView } from "@/components/games/plane/plane-world";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAppLock } from "@/lib/app-lock-context";
import { leaveGameScreen, useConfirmLeave } from "@/lib/leave-game";
import { getStoredPlaneBest, setStoredPlaneBest } from "@/lib/paper-plane-storage";
import { useGameOnScreen } from "@/lib/use-game-on-screen";

export default function PlaneScreen() {
  const { t } = useLang();
  const pinReady = useEnterGameModeOnce();
  const onScreen = useGameOnScreen();
  const dark = useColorScheme() === "dark";
  const { lock } = useAppLock();
  const view = usePlaneView();
  const live = useRef<PlaneState>(newPlaneGame(56));
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [shown, setShown] = useState({ phase: live.current.phase, score: 0, width: live.current.width });
  const [best, setBest] = useState(0);
  // The highest best known on this screen, from storage or a game just played; null until a read succeeds.
  const bestRef = useRef<number | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [guard, setGuard] = useState(false);

  const publish = useCallback(
    (next: PlaneState) => {
      // Guard the game-over card from its first frame, so a late tap cannot reach its buttons.
      if (next.phase === "over" && live.current.phase !== "over") setGuard(true);
      live.current = next;
      view.sync(next);
      setShown((v) =>
        v.phase === next.phase && v.score === next.score && v.width === next.width
          ? v
          : { phase: next.phase, score: next.score, width: next.width }
      );
    },
    [view]
  );

  const fresh = useCallback(() => {
    publish(newPlaneGame(size ? planeWorldWidth(size.w, size.h) : 56));
    setNewBest(false);
  }, [publish, size]);

  useEffect(() => {
    let alive = true;
    void getStoredPlaneBest().then((b) => {
      if (b === null) return;
      bestRef.current = Math.max(bestRef.current ?? 0, b);
      if (alive) setBest((v) => Math.max(v, b));
    });
    return () => {
      alive = false;
    };
  }, []);

  // A new size changes the world's width; only a game not started yet takes it.
  useEffect(() => {
    if (live.current.phase === "ready") fresh();
  }, [fresh]);

  useEffect(() => {
    if (!onScreen) publish(planePause(live.current));
  }, [onScreen, shown.phase, publish]);

  useEffect(() => {
    if (shown.phase !== "flying") return;
    return startFrameLoop((dt) => {
      const next = stepPlane(live.current, dt, Math.random);
      publish(next);
      return next.phase === "flying";
    });
  }, [shown.phase, publish]);

  useEffect(() => {
    if (shown.phase !== "over") return;
    const score = live.current.score;
    let alive = true;
    const now = planeBestAfter(score, bestRef.current);
    setNewBest(now.isNew);
    setBest(now.best);
    // Read the stored best again: the first read may not have landed yet. The save runs even if
    // the player has left the screen by then; only the card waits for the screen.
    void getStoredPlaneBest().then((stored) => {
      const after = planeBestAfter(score, stored, bestRef.current);
      if (after.isNew) void setStoredPlaneBest(score);
      if (stored !== null || bestRef.current !== null) bestRef.current = after.best;
      if (!alive) return;
      setNewBest(after.isNew);
      setBest(after.best);
    });
    const id = setTimeout(() => setGuard(false), PLANE_OVER_GUARD_MS);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [shown.phase]);

  const playing = shown.phase === "flying" || shown.phase === "paused";
  useConfirmLeave(playing);

  if (!pinReady) return <GamesPinSetup title={t.planeTitle} />;

  return (
    <GameScreen title={t.planeTitle} tone="game" scroll={false} nav={!playing} confirmBack={playing}>
      <Pressable
        className="flex-1 overflow-hidden rounded-2xl"
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        onPressIn={() => {
          const next = planeTap(live.current, Math.random);
          if (next !== live.current) publish(next);
        }}>
        {size ? <PlaneWorld view={view} width={size.w} height={size.h} worldWidth={shown.width} dark={dark} /> : <View />}
        <PlaneOverlay
          phase={shown.phase}
          score={shown.score}
          best={best}
          newBest={newBest}
          guard={guard}
          ink={(dark ? PLANE_COLORS.dark : PLANE_COLORS.light).score}
          onAgain={fresh}
          onBack={() => leaveGameScreen(lock.gameMode)}
        />
      </Pressable>
    </GameScreen>
  );
}
