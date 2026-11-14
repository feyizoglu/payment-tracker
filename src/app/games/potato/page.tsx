"use client";

import GamesShell from "@/components/games/GamesShell";
import PotatoGame from "@/components/games/potato/PotatoGame";
import { useLang } from "@/lib/i18n";

export default function PotatoPage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.potatoTitle} backHref="/games">
      <PotatoGame />
    </GamesShell>
  );
}
