"use client";

import GamesShell from "@/components/games/GamesShell";
import HuntGame from "@/components/games/bills/HuntGame";
import { useLang } from "@/lib/i18n";

export default function BillsPage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.huntTitle} backHref="/games">
      <HuntGame />
    </GamesShell>
  );
}
