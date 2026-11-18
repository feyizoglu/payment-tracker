"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startFrameLoop } from "@/lib/frame-loop";
import {
  PLANE_BEST_KEY,
  PLANE_COLORS,
  PLANE_OVER_GUARD_MS,
  newPlaneGame,
  parseSavedBest,
  planePause,
  planeTap,
  planeWorldWidth,
  stepPlane,
  type PlaneState,
} from "@/lib/paper-plane";
import { drawPlaneScene } from "./draw-plane";
import PlaneOverlay from "./PlaneOverlay";

function readBest(): number {
  try {
    return parseSavedBest(localStorage.getItem(PLANE_BEST_KEY));
  } catch {
    return 0;
  }
}

function writeBest(best: number) {
  try {
    localStorage.setItem(PLANE_BEST_KEY, String(best));
  } catch {
    // Private mode or full storage: the game still runs, it just forgets.
  }
}

export default function PlaneGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<PlaneState>(newPlaneGame(56));
  // Space plays again after a crash, but only once the game-over guard is off.
  const canRestart = useRef(false);
  const [view, setView] = useState<{ phase: PlaneState["phase"]; score: number }>({ phase: "ready", score: 0 });
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
    drawPlaneScene(ctx, live.current, w, h, document.documentElement.classList.contains("dark"));
  }, []);

  const publish = useCallback((next: PlaneState) => {
    live.current = next;
    setView((v) => (v.phase === next.phase && v.score === next.score ? v : { phase: next.phase, score: next.score }));
  }, []);

  const fresh = useCallback(() => {
    const canvas = canvasRef.current;
    publish(newPlaneGame(canvas ? planeWorldWidth(canvas.clientWidth, canvas.clientHeight) : 56));
    setNewBest(false);
    draw();
  }, [draw, publish]);

  useEffect(() => {
    // localStorage only exists in the browser: reading it during render would differ from the server's HTML.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBest(readBest());
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
    const next = planeTap(live.current, Math.random);
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
      if (document.hidden) publish(planePause(live.current));
    };
    const onBlur = () => publish(planePause(live.current));
    // A game not started yet takes the new shape; one in play keeps its world.
    const onResize = () => (live.current.phase === "ready" ? fresh() : draw());
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

  useEffect(() => {
    if (view.phase !== "flying") return;
    return startFrameLoop((dt) => {
      const next = stepPlane(live.current, dt, Math.random);
      publish(next);
      draw();
      return next.phase === "flying";
    });
  }, [view.phase, draw, publish]);

  useEffect(() => {
    if (view.phase !== "over") return;
    const score = live.current.score;
    const stored = readBest();
    if (score > stored) {
      writeBest(score);
      setNewBest(true);
    }
    setBest(Math.max(stored, score));
    setGuard(true);
    canRestart.current = false;
    const id = setTimeout(() => {
      setGuard(false);
      canRestart.current = true;
    }, PLANE_OVER_GUARD_MS);
    return () => {
      clearTimeout(id);
      canRestart.current = false;
    };
  }, [view.phase]);

  return (
    <div
      className="relative h-[70vh] max-h-[760px] min-h-[420px] w-full select-none overflow-hidden rounded-2xl touch-none"
      onPointerDown={(e) => {
        // Touch and pen report button 0 too; a right or middle click is not a flap.
        if (e.button !== 0) return;
        e.preventDefault();
        tap();
      }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <PlaneOverlay phase={view.phase} score={view.score} best={best} newBest={newBest} guard={guard} ink={(dark ? PLANE_COLORS.dark : PLANE_COLORS.light).score} onAgain={fresh} />
    </div>
  );
}
