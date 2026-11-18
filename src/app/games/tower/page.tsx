"use client";

import GamesShell from "@/components/games/GamesShell";
import TowerGame from "@/components/games/tower/TowerGame";
import { useLang } from "@/lib/i18n";

export default function TowerPage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.towerTitle} backHref="/games">
      <TowerGame />
    </GamesShell>
  );
}
