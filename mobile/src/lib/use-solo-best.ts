import { useCallback, useEffect, useRef, useState } from "react";

import { bestAfter, newSessionBest, sessionRead } from "@ptracker/shared/best-score";

/**
 * The best score a single-player game screen shows and saves. The stored best is read when the
 * screen opens and again when a game ends, since the first read may not have landed by then.
 */
export function useSoloBest(read: () => Promise<number | null>, write: (best: number) => Promise<void>) {
  // Null until a read of the stored best has come back, so the screen never shows a best it does not know.
  const [best, setBest] = useState<number | null>(null);
  const [newBest, setNewBest] = useState(false);
  const session = useRef(newSessionBest());
  // Scores played on this screen whose stored-best read has not come back yet still count on the card.
  const played = useRef(0);

  useEffect(() => {
    let alive = true;
    void read().then((b) => {
      session.current = sessionRead(session.current, b);
      if (alive) setBest((v) => Math.max(v ?? 0, session.current.best, played.current));
    });
    return () => {
      alive = false;
    };
  }, [read]);

  /**
   * A game ended on `score`. The returned function stops the card's updates once the card is gone;
   * the save still runs, even after the screen closed.
   */
  const record = useCallback(
    (score: number) => {
      let alive = true;
      // Games ended earlier count even when their reads have not landed: reads may land out of order.
      const before = played.current;
      const now = bestAfter(score, { ...session.current, best: Math.max(session.current.best, before) }, null);
      played.current = Math.max(played.current, score);
      setNewBest(now.isNew);
      setBest((v) => (v === null ? null : Math.max(v, now.session.best)));
      void read().then((stored) => {
        const after = bestAfter(score, { ...session.current, best: Math.max(session.current.best, before) }, stored);
        session.current = after.session;
        if (after.save !== null) void write(after.save);
        if (!alive) return;
        setNewBest(after.isNew);
        setBest((v) => Math.max(v ?? 0, after.session.best));
      });
      return () => {
        alive = false;
      };
    },
    [read, write]
  );

  const clearNewBest = useCallback(() => setNewBest(false), []);

  return { best, newBest, record, clearNewBest };
}
