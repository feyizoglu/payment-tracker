# My Words — design

Date: 2026-11-22. A new section of the app, next to Finance, Events and Games, on web and mobile.

## Goal

Each user keeps their own list of English words they are learning. Saving a word fetches its
pronunciation (IPA and, when there is one, a recording), its definitions and example sentences.
A review screen asks the words back; a word answered right three times in a row counts as learned.
Progress shows as "120 words · 45 learned".

Name: **Kelimelerim** (TR) / **My Words** (EN). Route `/words` on both platforms.

## Owner's decisions (2026-11-22)

- Scope: word notebook plus a simple review. No spaced repetition in this version.
- Source: the free dictionary first (`dictionaryapi.dev`), written so it can be swapped for the
  Claude API later. Claude was priced at about $0.22 per 1,000 words on Haiku 5.5 and deferred.
- Turkish meaning: optional, typed by the user. A later Claude source would fill it.
- Learned: three "I know it" answers in a row; one "I don't know" resets the count.
- Mobile audio: opened in an in-app Chrome tab (`expo-web-browser`, already installed), so no new
  native module and the feature ships through an EAS update. Web plays it in the page.

## Data

Table `vocab_words` (SQL added to `supabase-schema.sql`; the owner runs it in Supabase before the
merge):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid fk `users`, on delete cascade | owner; never shared with a team |
| `word` | text | as typed, trimmed, inner spaces collapsed |
| `word_key` | text | lowercased `word`; unique with `user_id` |
| `meaning_tr` | text null | the user's Turkish meaning, at most 200 characters |
| `ipa` | text null | from the dictionary |
| `audio_url` | text null | first recording, preferring a US one |
| `senses` | jsonb | `[{ pos, definition, example? }]`, see below; `[]` when nothing was found |
| `lookup` | text | `found`, `not_found` or `failed` |
| `streak` | int, 0–3 | "I know it" answers in a row |
| `learned_at` | timestamptz null | set when `streak` reaches 3 |
| `reviewed_at` | timestamptz null | last review answer |
| `created_at` | timestamptz | |

A word is 1–40 characters of English letters, spaces, hyphens and apostrophes. Adding a word whose
`word_key` the user already has returns the existing row with HTTP 409.

## Dictionary lookup

One module, `src/lib/word-lookup.ts`, is the only code that knows the source. It takes a word and
returns `{ lookup, ipa, audioUrl, senses }`.

- `GET https://api.dictionaryapi.dev/api/v2/entries/en/<word>` with a 5 second timeout.
- 200: `ipa` is the first non-empty `phonetic` or `phonetics[].text`; `audioUrl` the first
  non-empty `phonetics[].audio`, a `-us.mp3` one first, accepted only when it is `https:`.
  `senses` keeps at most 3 definitions per part of speech across all entries, in the order given,
  each with its `example` when present. `lookup` is `found`.
- 404: `lookup` is `not_found`, everything else empty.
- Timeout, network error, other status or an unreadable body: `lookup` is `failed`.
- A word is saved whatever the lookup gives. A card whose lookup is `not_found` or `failed` offers
  **Try again**, which looks the word up again and stores the new result.
- The content is Wiktionary's (CC BY-SA) and the recordings Wikimedia Commons'; the card shows
  "Source: Wiktionary (CC BY-SA)".

## API

All routes need a session (`getSessionUser`) and touch only the caller's rows.

- `GET /api/words`: the caller's words, newest first.
- `POST /api/words` `{ word, meaningTr? }`: validates, looks the word up, inserts. 201 with the row;
  409 with the existing row; 400 for an invalid word or meaning.
- `PATCH /api/words/{id}` with exactly one of:
  - `{ meaningTr }`: set or clear the Turkish meaning.
  - `{ answer: "know" | "dontKnow" }`: `know` raises `streak` by one (at most 3) and sets
    `learned_at` when it reaches 3; `dontKnow` sets `streak` to 0. Both set `reviewed_at`. A
    learned word ignores answers. The update is one SQL statement, so two quick answers cannot
    both read the old streak.
  - `{ unlearn: true }`: `streak` 0, `learned_at` null.
  - `{ relookup: true }`: looks the word up again.
- `DELETE /api/words/{id}`.
- 404 when the id is not the caller's.

## Screens

Web pages under `src/app/words/`; mobile screens under `mobile/src/app/words/`, registered in
`mobile/src/app/_layout.tsx`.

- **Entry.** Web: a "My Words" link after "Games" wherever the Games link sits in the top menu
  (dashboard, economy, events header). Mobile: a 📖 icon (`menu_book`) beside the games icon in the
  month header.
- **List.** Progress line and bar ("120 words · 45 learned"); **Review (8)** with the count of
  unlearned words, disabled at 0; **+ Add word**; a search box matching the word and the Turkish
  meaning; filter All / Learning / Learned. Each row: word, IPA, Turkish meaning, three dots for the
  streak (●●○) or ✓ when learned. Tapping a row opens its card.
- **Add.** Word field and optional Turkish meaning; **Save** looks the word up and opens the card.
  A word already in the list shows "This word is already in your list." and opens its card.
- **Card.** Word, IPA, 🔊 when there is a recording, the Turkish meaning (editable in place), the
  senses grouped by part of speech with their examples, the streak dots, **Mark as not learned**
  on a learned word, **Delete** with a confirmation, the source line, and **Try again** when the
  lookup did not find the word.
- **Review.** Up to 10 unlearned words: lowest streak first, then the longest unreviewed (never
  reviewed first), then oldest. Each shows the word, IPA and 🔊; **Show** reveals the Turkish
  meaning, the first sense and its example; then **I know it** / **I don't know**. The answer is
  sent at once; the next word does not wait for it. A failed send shows a short error and keeps
  the round going. The end shows "7 of 10 · 2 words learned" and **Another round**. No unlearned
  words: "Nothing to review."
- **Leaving.** Back during a review just leaves; answers already sent are kept.
- Light and dark themes like the rest of the app. Colour: emerald (tile `emerald-50`, icon
  `emerald-600`).
- All texts in `en` and `tr`.

## Errors and offline

The section needs the network; it is not added to the games offline cache. A failed load shows
"Could not load your words." with **Retry**. The API's errors for this section carry a short
`code` (`invalid_word`, `invalid_meaning`, `duplicate`, `not_found`) beside the English `error`;
both apps show the translated text for the code and fall back to `error` for anything else. A dictionary
outage never blocks saving.

## Testing

- `word-lookup`: a found word (IPA, US recording preferred, three senses per part of speech,
  examples kept), a phrase with no phonetics, 404, timeout, a non-https audio link dropped.
- Validation: allowed and refused words, the 40 and 200 character limits, `word_key` folding.
- API routes: unauthenticated 401, another user's id 404, duplicate 409, the streak rules (third
  "know" sets `learned_at`, "dontKnow" resets, answers on a learned word ignored, unlearn), relookup.
- Review order and round size as a pure function shared by web and mobile.
- Web pages and mobile screens: list, filter and search, add with duplicate, card edit and delete,
  a review round to its summary, audio played in the page on web and opened in the browser on
  mobile.

## Out of scope

Spaced repetition, Claude as the source, Turkish meanings filled automatically, sharing lists,
importing word lists, offline use, in-app audio on mobile.
