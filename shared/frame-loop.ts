/** Calls `onFrame` with the seconds since the last frame (0 on the first) until it returns false or the loop is stopped. */
export function startFrameLoop(onFrame: (dt: number) => boolean): () => void {
  let last: number | null = null;
  let stopped = false;
  let id = 0;
  const tick = (now: number) => {
    if (stopped) return;
    const dt = last === null ? 0 : (now - last) / 1000;
    last = now;
    if (onFrame(dt)) id = requestAnimationFrame(tick);
    else stopped = true;
  };
  id = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
  };
}
