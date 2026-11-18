// The best-score rule shared by the single-player games: a saved best, and what one screen knows.

export function parseSavedBest(raw: string | null): number {
  if (raw === null || raw.trim() === "") return 0;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** What one screen knows about the best: the highest score read or played, and whether any read succeeded. */
export interface SessionBest {
  best: number;
  known: boolean;
}

export const newSessionBest = (): SessionBest => ({ best: 0, known: false });

/** The session after a storage read: `null` is a read that failed. */
export function sessionRead(session: SessionBest, stored: number | null): SessionBest {
  return stored === null ? session : { best: Math.max(session.best, stored), known: true };
}

/**
 * A game that scored `score` ends, with the stored best just read (`null` if that read failed).
 * A new best is claimed only once some read has succeeded, so a broken read never passes for an
 * empty record; `save` is the session best to write when it beats what is stored.
 */
export function bestAfter(
  score: number,
  session: SessionBest,
  stored: number | null
): { session: SessionBest; isNew: boolean; save: number | null } {
  const known = session.known || stored !== null;
  const top = Math.max(session.best, stored ?? 0);
  const best = Math.max(top, score);
  const beats = best > (stored ?? session.best);
  return { session: { best, known }, isNew: known && score > top, save: known && beats ? best : null };
}
