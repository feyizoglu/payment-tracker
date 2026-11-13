"use client";

import GamesShell from "@/components/games/GamesShell";
import WordGame from "@/components/games/word/WordGame";
import { useLang } from "@/lib/i18n";

export default function WordGamePage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.wordTitle} backHref="/games">
      <WordGame />
    </GamesShell>
  );
}
