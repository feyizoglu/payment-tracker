import { useEffect, useState } from "react";

// Whether the "leave the game?" dialog is open. A native Alert does not move the app out of
// the active state, so the game clocks read this to stand still under it.
let open = false;
const listeners = new Set<() => void>();

export function setGameDialogOpen(next: boolean) {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

export function isGameDialogOpen(): boolean {
  return open;
}

export function useGameDialogOpen(): boolean {
  const [value, setValue] = useState(open);
  useEffect(() => {
    const listener = () => setValue(open);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}
