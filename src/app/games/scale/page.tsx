"use client";

import GamesShell from "@/components/games/GamesShell";
import ScaleGame from "@/components/games/scale/ScaleGame";
import { useLang } from "@/lib/i18n";

export default function ScalePage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.scaleTitle} backHref="/games">
      <ScaleGame />
    </GamesShell>
  );
}
