// Builds Secret Word's word lists. Usage:
//   npx tsx@4.23.15 scripts/secret-word/build-dictionary.ts <master-dictionary.dict> <enable1.txt>
// Sources: Zemberek's morphology/src/main/resources/tr/master-dictionary.dict (Apache 2.0) and the
// public-domain ENABLE list (enable1.txt). See shared/secret-word-dictionary/NOTICE.md.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { englishRoots, turkishRoots, wordsModule } from "../../shared/secret-word-dictionary/build";

const [trPath, enPath] = process.argv.slice(2);
if (!trPath || !enPath) {
  console.error("usage: npx tsx@4.23.15 scripts/secret-word/build-dictionary.ts <master-dictionary.dict> <enable1.txt>");
  process.exit(1);
}
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../shared/secret-word-dictionary");
const tr = turkishRoots(readFileSync(trPath, "utf8"));
const en = englishRoots(readFileSync(enPath, "utf8"));
writeFileSync(path.join(out, "tr.ts"), wordsModule("SECRET_WORDS_TR", "Zemberek's master-dictionary.dict", tr));
writeFileSync(path.join(out, "en.ts"), wordsModule("SECRET_WORDS_EN", "the ENABLE word list", en));
console.log(`tr: ${tr.length} words, en: ${en.length} words`);
