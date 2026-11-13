"use client";

import GamesShell from "@/components/games/GamesShell";
import WolfGame from "@/components/games/wolf/WolfGame";
import { useLang } from "@/lib/i18n";

export default function WolfPage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.wolfTitle} backHref="/games">
      <WolfGame />
    </GamesShell>
  );
}
