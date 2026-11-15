# Who Am I? Wikidata candidates

`fetch-wikidata.mjs` pulls candidate people and characters for the Who Am I? cards from the
Wikidata Query Service. Wikidata is CC0. The script has no dependencies and needs Node 20 or
newer (built-in `fetch`).

```sh
node scripts/who-game/fetch-wikidata.mjs [outDir] [--cache dir]
```

- `outDir` defaults to `/tmp/who-data`.
- `--cache dir` stores each query's response under `dir` and reuses it on the next run. Use it
  while tuning the script; leave it out for a fresh pull.

A full run without a cache takes about 40 minutes and sends about 330 queries. It sends one
query at a time, with a 1.5 s pause between queries. It retries 429, 5xx and timeouts with
backoff and honours `Retry-After`. A chunked query that keeps failing is split in half, and
queries that still fail are listed in `_run.json`.

## Output

The raw output is not committed. Agents curate it into `shared/who-cards/`. The script writes
one JSON array per batch, sorted by Wikipedia sitelinks:

- People: `world-music`, `world-screen`, `world-sports`, `world-science`, `world-arts`,
  `world-history`, `tr-music`, `tr-screen`, `tr-sports` and `tr-other`. A record has `qid`,
  `labelEn`, `labelTr`, `descEn`, `descTr`, `sitelinks`, `hasTrWiki`, `occupations`,
  `countries`, `birthYear` and `deathYear`.
- Characters: `animation`, `screen-books` and `myth-tales`. These records carry `classes`,
  `fromWork` (the best-known "present in work" value) and `universe` ("from narrative
  universe") in place of `occupations`.
- `_excluded-people.json`: the best-known people the content rules dropped (400 world, 200
  Turkish), each with its reason.
- `_run.json`: run time, query count, failed queries, per-group pool sizes and per-file stats.

## Rules

- `labelEn` falls back to the multilingual (`mul`) label. `labelTr` is the Turkish label only,
  otherwise null.
- People are found by occupation (P106). An occupation counts toward the group whose root it is
  nearest to, down to three subclass levels. Wikidata's subclass tree is noisy (teacher sits
  under scientist, for example), so the script prefers occupations at most one level below a
  root and uses deeper ones only when a person has nothing closer.
- Each person goes to exactly one batch. Turkish or Ottoman citizens with a Turkish Wikipedia
  article go to `tr-*`; everyone else goes to `world-*`. The domain is the first match in the
  order music, screen, sports, science, arts, history.
- Within a domain, each occupation group has its own quota, so footballers cannot crowd out other
  sports. When a group runs out of candidates, its unused quota passes to the other groups in the
  same batch. YouTubers and other internet personalities from Turkey go to `tr-other`.
- Excluded people:
  - politicians, monarchs, and heads of state or government (by occupation or by position held);
  - military leaders, and military officers or soldiers who have no other occupation from the
    batch domains (James Cook, Yuri Gagarin and Neil Armstrong stay unless another rule drops
    them);
  - clergy and religious leaders;
  - pornographic actors, criminals and terrorists;
  - anyone born after 2008.

  Subclasses of these occupations are excluded too, except a few that only reach these roots
  through bad subclass links, such as astrologer, scribe and policy advisor.
- Characters are placed by these rules, first match wins:
  1. Any mythology, legend, folklore, fairy-tale or puppet class goes to `myth-tales`.
  2. A class from a live-action franchise (Star Wars, Star Trek, Harry Potter, Game of Thrones,
     Doctor Who) goes to `screen-books`.
  3. Comics, anime, manga, video game and cartoon-franchise classes are counted against literary
     and theatre classes, and the larger count decides.
  4. On a tie, the type of the character's best-known work decides.

  "Film character" and "television character" do not count, because Wikidata also puts them on
  animated characters. A plain "animated character" class only decides when nothing else does.
  `animation` and `screen-books` keep at most 40 characters per narrative universe.
- Dropped characters:
  - characters from pornographic or hentai works;
  - biblical and Quranic figures, angels, prophets and saints;
  - deities outside Greek, Roman, Norse, Egyptian and Turkic mythology.

  Santa Claus and other Christmas gift-bringers are kept.
- Characters linked to Turkish works or Turkic mythology, plus a short list of Turkish folk
  figures (Keloğlan, Nasreddin Hoca, Karagöz, Hacivat and others), are kept whatever their
  sitelinks.
