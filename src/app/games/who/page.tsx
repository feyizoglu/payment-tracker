"use client";

import GamesShell from "@/components/games/GamesShell";
import WhoGame from "@/components/games/who/WhoGame";
import { useLang } from "@/lib/i18n";

export default function WhoPage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.whoTitle} backHref="/games">
      <WhoGame />
    </GamesShell>
  );
}
