import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { startFrameLoop } from "@ptracker/shared/frame-loop";
import { bestAfter, newSessionBest, sessionRead } from "@ptracker/shared/best-score";
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
  const [best, setBest] = useState(0);
  const session = useRef(newSessionBest());
  // Scores played on this screen whose stored-best read has not come back yet still count on the card.
  const played = useRef(0);
  const [newBest, setNewBest] = useState(false);
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
    setNewBest(false);
    setGuard(false);
  }, [publish]);

  useEffect(() => {
    let alive = true;
    void getStoredTowerBest().then((b) => {
      session.current = sessionRead(session.current, b);
      if (alive) setBest((v) => Math.max(v, session.current.best));
    });
    return () => {
      alive = false;
    };
  }, []);

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
    const score = live.current.score;
    let alive = true;
    const now = bestAfter(score, { ...session.current, best: Math.max(session.current.best, played.current) }, null);
    played.current = Math.max(played.current, score);
    setNewBest(now.isNew);
    setBest((v) => Math.max(v, now.session.best));
    // Read the stored best again: the first read may not have landed yet. The save runs even if
    // the player has left the screen by then; only the card waits for the screen.
    void getStoredTowerBest().then((stored) => {
      const after = bestAfter(score, session.current, stored);
      session.current = after.session;
      if (after.save !== null) void setStoredTowerBest(after.save);
      if (!alive) return;
      setNewBest(after.isNew);
      setBest((v) => Math.max(v, after.session.best));
    });
    const id = setTimeout(() => setGuard(false), TOWER_OVER_GUARD_MS);
    return () => {
      alive = false;
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
