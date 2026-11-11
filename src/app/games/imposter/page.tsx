"use client";

import GamesShell from "@/components/games/GamesShell";
import ImposterGame from "@/components/games/ImposterGame";
import { useLang } from "@/lib/i18n";

export default function ImposterPage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.imposterTitle} backHref="/games">
      <ImposterGame />
    </GamesShell>
  );
}
