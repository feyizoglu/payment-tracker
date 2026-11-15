"use client";

import GamesShell from "@/components/games/GamesShell";
import ClueGame from "@/components/games/clue/ClueGame";
import { useLang } from "@/lib/i18n";

export default function CluePage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.clueTitle} backHref="/games">
      <ClueGame />
    </GamesShell>
  );
}
