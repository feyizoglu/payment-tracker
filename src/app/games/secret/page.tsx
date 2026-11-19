"use client";

import GamesShell from "@/components/games/GamesShell";
import SecretGame from "@/components/games/secret/SecretGame";
import { useLang } from "@/lib/i18n";

export default function SecretPage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.secretTitle} backHref="/games">
      <SecretGame />
    </GamesShell>
  );
}
