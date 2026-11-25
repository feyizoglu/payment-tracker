"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { startFrameLoop } from "@/lib/frame-loop";
import { bestAfter, newSessionBest, sessionRead } from "@/lib/best-score";
import {
  HUNT_BEST_KEY,
  HUNT_COLORS,
  HUNT_OVER_GUARD_MS,
  SPEED_UP,
  huntAim,
  huntCallBack,
  huntFire,
  huntSpeedUp,
  huntStart,
  huntViewport,
  newHuntGame,
  stepHunt,
  type HuntPhase,
  type HuntState,
} from "@/lib/bill-hunt";
import { readSavedBest, writeSavedBest } from "@/lib/saved-best";
import { drawHuntScene } from "./draw-hunt";
import HuntOverlay from "./HuntOverlay";

interface View {
  phase: HuntPhase;
  month: number;
  coins: number;
  score: number;
  sped: boolean;
}

const viewOf = (s: HuntState): View => ({ phase: s.phase, month: s.month, coins: s.coins, score: s.score, sped: s.shot?.speed === SPEED_UP });
const sameView = (a: View, b: View) => a.phase === b.phase && a.month === b.month && a.coins === b.coins && a.score === b.score && a.sped === b.sped;

export default function HuntGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const live = useRef<HuntState>(newHuntGame(Math.random));
  const pull = useRef<{ id: number; x: number; y: number } | null>(null);
  const aim = useRef<number | null>(null);
  const session = useRef(newSessionBest());
  const [view, setView] = useState<View>({ phase: "ready", month: 1, coins: 1, score: 0, sped: false });
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
    drawHuntScene(ctx, live.current, w, h, document.documentElement.classList.contains("dark"), aim.current);
  }, []);

  const publish = useCallback((next: HuntState) => {
    // Guard the game-over card from its first frame, so a late tap cannot reach its buttons.
    if (next.phase === "over" && live.current.phase !== "over") setGuard(true);
    live.current = next;
    const v = viewOf(next);
    setView((old) => (sameView(old, v) ? old : v));
  }, []);

  const fresh = useCallback(() => {
    publish(newHuntGame(Math.random));
    setNewBest(false);
    setGuard(false);
    draw();
  }, [draw, publish]);

  useEffect(() => {
    // localStorage only exists in the browser: reading it during render would differ from the server's HTML.
    session.current = sessionRead(session.current, readSavedBest(HUNT_BEST_KEY));
    setBest(session.current.best);
    setDark(document.documentElement.classList.contains("dark"));
    draw();
  }, [draw]);

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

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  useEffect(() => {
    if (view.phase !== "throwing") return;
    return startFrameLoop((dt) => {
      const next = stepHunt(live.current, dt, Math.random);
      publish(next);
      draw();
      return next.phase === "throwing";
    });
  }, [view.phase, draw, publish]);

  useEffect(() => {
    if (view.phase !== "over") return;
    const after = bestAfter(live.current.score, session.current, readSavedBest(HUNT_BEST_KEY));
    session.current = after.session;
    if (after.save !== null) writeSavedBest(HUNT_BEST_KEY, after.save);
    setNewBest(after.isNew);
    setBest(after.session.best);
    const id = setTimeout(() => setGuard(false), HUNT_OVER_GUARD_MS);
    return () => clearTimeout(id);
  }, [view.phase]);

  const aimFrom = useCallback((e: PointerEvent<HTMLDivElement>): number | null => {
    const canvas = canvasRef.current;
    if (!pull.current || !canvas) return null;
    const { scale } = huntViewport(canvas.clientWidth, canvas.clientHeight);
    return huntAim((e.clientX - pull.current.x) / scale, (e.clientY - pull.current.y) / scale);
  }, []);

  const endPull = useCallback(() => {
    pull.current = null;
    aim.current = null;
    draw();
  }, [draw]);

  return (
    <div
      className="relative h-[70vh] max-h-[760px] min-h-[420px] w-full select-none overflow-hidden rounded-2xl touch-none"
      onPointerDown={(e) => {
        // Touch and pen report button 0 too; a right or middle click, or a press on a button, is not a pull.
        if (e.button !== 0 || live.current.phase !== "aiming") return;
        if ((e.target as Element | null)?.closest?.("button, a")) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        pull.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        aim.current = null;
      }}
      onPointerMove={(e) => {
        if (pull.current?.id !== e.pointerId) return;
        aim.current = aimFrom(e);
        draw();
      }}
      onPointerUp={(e) => {
        if (pull.current?.id !== e.pointerId) return;
        const angle = aimFrom(e);
        endPull();
        if (angle !== null) publish(huntFire(live.current, angle));
      }}
      onPointerCancel={(e) => {
        if (pull.current?.id === e.pointerId) endPull();
      }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <HuntOverlay
        phase={view.phase}
        month={view.month}
        coins={view.coins}
        score={view.score}
        sped={view.sped}
        best={best}
        newBest={newBest}
        guard={guard}
        ink={(dark ? HUNT_COLORS.dark : HUNT_COLORS.light).ink}
        onStart={() => {
          publish(huntStart(live.current));
          draw();
        }}
        onSpeedUp={() => publish(huntSpeedUp(live.current))}
        onCallBack={() => {
          publish(huntCallBack(live.current, Math.random));
          draw();
        }}
        onAgain={() => {
          fresh();
          publish(huntStart(live.current));
          draw();
        }}
      />
    </div>
  );
}
