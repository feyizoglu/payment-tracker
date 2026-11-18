"use client";

import GamesShell from "@/components/games/GamesShell";
import PlaneGame from "@/components/games/plane/PlaneGame";
import { useLang } from "@/lib/i18n";

export default function PlanePage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.planeTitle} backHref="/games">
      <PlaneGame />
    </GamesShell>
  );
}
