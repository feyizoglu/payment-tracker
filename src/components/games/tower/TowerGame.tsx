"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startFrameLoop } from "@/lib/frame-loop";
import { bestAfter, newSessionBest, parseSavedBest, sessionRead } from "@/lib/best-score";
import {
  TOWER_BEST_KEY,
  TOWER_COLORS,
  TOWER_OVER_GUARD_MS,
  newTowerGame,
  stepTower,
  towerPause,
  towerTap,
  type TowerState,
} from "@/lib/book-tower";
import { drawTowerScene } from "./draw-tower";
import TowerOverlay from "./TowerOverlay";

/** The saved best, or null when the browser refuses to read storage. */
function readBest(): number | null {
  try {
    return parseSavedBest(localStorage.getItem(TOWER_BEST_KEY));
  } catch {
    return null;
  }
}

function writeBest(best: number) {
  try {
    localStorage.setItem(TOWER_BEST_KEY, String(best));
  } catch {
    // Private mode or full storage: the game still runs, it just forgets.
  }
}

export default function TowerGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<TowerState>(newTowerGame());
  // Space plays again after a crash, but only once the game-over guard is off.
  const canRestart = useRef(false);
  const session = useRef(newSessionBest());
  const [view, setView] = useState<{ phase: TowerState["phase"]; score: number; perfect: boolean }>({
    phase: "ready",
    score: 0,
    perfect: false,
  });
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [guard, setGuard] = useState(false);
  const [dark, setDark] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w * ratio)) canvas.width = Math.round(w * ratio);
    if (canvas.height !== Math.round(h * ratio)) canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawTowerScene(ctx, live.current, w, h, document.documentElement.classList.contains("dark"));
  }, []);

  const publish = useCallback((next: TowerState) => {
    // Guard the game-over card from its first frame, so a late tap cannot reach its buttons.
    if (next.phase === "over" && live.current.phase !== "over") setGuard(true);
    live.current = next;
    const perfect = next.perfect > 0;
    setView((v) =>
      v.phase === next.phase && v.score === next.score && v.perfect === perfect ? v : { phase: next.phase, score: next.score, perfect }
    );
  }, []);

  const fresh = useCallback(() => {
    publish(newTowerGame());
    setNewBest(false);
    setGuard(false);
    draw();
  }, [draw, publish]);

  useEffect(() => {
    // localStorage only exists in the browser: reading it during render would differ from the server's HTML.
    session.current = sessionRead(session.current, readBest());
    setBest(session.current.best);
    setDark(document.documentElement.classList.contains("dark"));
    fresh();
  }, [fresh]);

  // The theme can change while the page is open (the header's theme picker, or the system theme).
  useEffect(() => {
    const html = document.documentElement;
    const observer = new MutationObserver(() => {
      setDark(html.classList.contains("dark"));
      draw();
    });
    observer.observe(html, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [draw]);

  const tap = useCallback(() => {
    const next = towerTap(live.current);
    if (next !== live.current) publish(next);
  }, [publish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      // A focused button or link takes Space itself, like the Again button on the game-over card.
      if ((e.target as Element | null)?.closest?.("button, a, input, textarea, select")) return;
      e.preventDefault();
      if (live.current.phase === "over") {
        if (canRestart.current) fresh();
        return;
      }
      tap();
    };
    const onHide = () => {
      if (document.hidden) publish(towerPause(live.current));
    };
    const onBlur = () => publish(towerPause(live.current));
    const onResize = () => draw();
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onBlur);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [tap, publish, draw, fresh]);

  // After a miss the loop runs on until the last falling piece is gone.
  useEffect(() => {
    if (view.phase !== "playing" && view.phase !== "over") return;
    return startFrameLoop((dt) => {
      const next = stepTower(live.current, dt);
      publish(next);
      draw();
      return next.phase === "playing" || next.pieces.length > 0;
    });
  }, [view.phase, draw, publish]);

  useEffect(() => {
    if (view.phase !== "over") return;
    const score = live.current.score;
    const after = bestAfter(score, session.current, readBest());
    session.current = after.session;
    if (after.save !== null) writeBest(after.save);
    setNewBest(after.isNew);
    setBest(after.session.best);
    canRestart.current = false;
    const id = setTimeout(() => {
      setGuard(false);
      canRestart.current = true;
    }, TOWER_OVER_GUARD_MS);
    return () => {
      clearTimeout(id);
      canRestart.current = false;
    };
  }, [view.phase]);

  return (
    <div
      className="relative h-[70vh] max-h-[760px] min-h-[420px] w-full select-none overflow-hidden rounded-2xl touch-none"
      onPointerDown={(e) => {
        // Touch and pen report button 0 too; a right or middle click is not a drop.
        if (e.button !== 0) return;
        e.preventDefault();
        tap();
      }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <TowerOverlay
        phase={view.phase}
        score={view.score}
        perfect={view.perfect}
        best={best}
        newBest={newBest}
        guard={guard}
        ink={(dark ? TOWER_COLORS.dark : TOWER_COLORS.light).score}
        onAgain={fresh}
      />
    </div>
  );
}
