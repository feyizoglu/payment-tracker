# Wolf Night (hidden roles game) — design

Date: 2026-11-13. A game in the Games section next to Imposter
(`2026-11-11-imposter-game-design.md`, `2026-11-12-imposter-visuals-design.md`) and Describe It
(`2026-11-13-word-game-design.md`, on its own branch).

## Goal

A hidden-roles party game for one phone: a few players are secretly wolves who remove a
villager every night; by day everyone talks and the village votes someone out. It ships on
web and mobile together and works offline. The rules are a common folk party-game genre; the
name, texts and look are our own, and no existing game's look or branding is copied.

Name: **Kurt Gecesi** (TR) / **Wolf Night** (EN). Route `/games/wolf` on both platforms.

## Decisions

| Topic | Decision |
|---|---|
| Players | 5 to 12, each with their own colour as in Imposter |
| Night | Chosen in setup: the phone goes round the table, or a human narrator runs it |
| Roles | Wolf and Villager always; Seer, Doctor, Hunter and Witch can each be switched on |
| Wolves | Suggested from the player count, can be changed |
| Day vote | Open: the table decides aloud, the phone holder enters the result |
| Rules shown | Before every deal, the game shows what each role in this game does and how the game ends |
| Not included | Secret day vote, more roles, saved games, sound or vibration |

## Roles

The texts below are what the game shows (translated in `shared/i18n.ts`).

| Role | Side | What it does |
|---|---|---|
| Wolf | Wolves | Each night the wolves choose one villager to remove. Wolves know each other. |
| Villager | Village | No night power. Finds the wolves by talking and voting. |
| Seer | Village | Each night picks one other player and learns whether they are a wolf. |
| Doctor | Village | Each night protects one player from the wolves, themselves included, but not the same player two nights in a row. |
| Hunter | Village | When removed, by night or by vote, at once takes one other player with them. |
| Witch | Village | Has one healing potion (saves the wolves' victim) and one poison potion (removes any other player), each once per game and at most one of them per night. |

Rules of play:
- Wolves can only choose a player who is not a wolf. The seer cannot pick themselves. The
  witch cannot poison herself, but may heal herself when she is the victim.
- The doctor and the healing potion stop only the wolves; poison and the hunter's shot
  cannot be stopped.
- Removed players stay silent for the rest of the game.

## How the game ends

- **The village wins** when no wolf is left.
- **The wolves win** when the living wolves are as many as or more than the other living
  players.
- Checked after every removal: after the night's results, after the vote and after each
  hunter shot. A removed hunter shoots first and the check runs after the shot, so the shot
  can still stop a wolf win. When both are true at once (the last wolf and the last
  villagers fall together), the village wins.

## Setup wizard

Three steps with progress dots and Back / Next, like Imposter's. Settings are remembered on
the device; **Start with last settings** on step 1 when they are valid.

1. **Players.** As in Imposter: one card per player in their colour, name field, remove,
   "Add player", 5 to 12 players, no empty or repeated names.
2. **Roles.** Wolf count with − / + and the suggested value marked (5–7 players: 1, 8–11: 2,
   12: 3; the suggestion follows the player count until the count is changed by hand). One
   switch per special role, each with its one-line description from the table above. A line
   shows the result, e.g. "2 wolves, Seer, Doctor, 5 villagers".
   Valid when: at least 1 wolf; wolves fewer than the other players; wolves plus special
   roles not more than the players.
3. **Rules.**
   - Night: **Pass the phone** or **Narrator** (a person who does not play runs the night).
   - Discussion timer: off or 1 to 10 minutes (as in Imposter).
   - Show the role of a removed player: on (default) or off.

### This game's rules (shown every time)

Before every deal — after the wizard, after **Start with last settings** and after **Play
again** — a **This game** screen lists:
- each role in this game with its count and its description, wolves first;
- how the game ends (the two lines above);
- for Pass the phone: "Every night the phone goes to every living player; everyone makes a
  choice, so nobody can tell who did what." For Narrator: "The narrator does not play; keep
  your eyes closed at night until your role is called."
- "Removed players stay silent."

Its button is **Deal the cards**. The same screen (without the button) opens from a
**Rules** button on the hand-over, day and narrator screens during the game. It shows only
what is in the game, never who has which role.

## Dealing

The phone goes to every player in seat order with Imposter's hold card (`DealTurn`: hold to
see on touch, Show / Hide on desktop). The card shows the role name, its description, and for
wolves the names of the other wolves. In Narrator mode the phone then goes back to the
narrator, whose screen lists every player with their role.

## Night: Pass the phone

- The phone visits every living player in seat order. Each night starts one living player
  later than the night before (dead seats are skipped, so no one starts two nights running).
- **Every visit has the same shape and the same number of taps, whatever the role**, because
  the table can see any screen that is not held:
  1. Imposter's hand-over screen ("Give the phone to Ayşe").
  2. A hold card with the role, tonight's task and its rules:
     - **Wolf:** "Choose a victim who is not a wolf", plus the earlier wolves' choices tonight.
     - **Seer:** "Choose a player to learn whether they are a wolf; not yourself."
     - **Doctor:** "Choose a player to protect; not the same as last night (X)."
     - **Villager, Hunter, Witch:** "Who do you think is a wolf?": a choice that changes
       nothing.
  3. An open choice screen that looks the same for everyone: every living player as a button,
     all drawn alike and all tappable, in the visitor's colour, with the same heading.
  4. A second hold card with the result: the seer's answer "Wolf" / "Not a wolf", or "Your
     choice is saved" for everyone else. A choice the rules do not allow is taken as doing
     nothing, and this card says so and why: a wolf choosing a wolf casts no vote, the seer
     choosing themselves learns nothing, the doctor repeating last night protects no one, the
     witch choosing what her potions cannot do uses none. There is no going back to the
     choice screen, because a visit that went back would show the table that the visitor has
     a role with rules.
  5. Next player. Every visit, allowed choice or not, takes the same steps and taps.
- The wolves' victim is the player most of them chose; a tie is settled at random.
- **Witch lap:** when a witch is alive and has a potion left, the phone goes round once more,
  with the same five steps for every visitor. The choice screen also has a **Nobody** button.
  - The witch's first hold card shows the victim and the potions left: choosing the victim
    uses the healing potion, choosing anyone else uses the poison, Nobody uses neither. Only
    one potion per night.
  - Everyone else's card says "Nothing to do this lap; choose anyone", and their choice
    changes nothing.
  The lap tells the table only that a witch with a potion is alive. With "show roles" off,
  a lap that stops coming still tells the table that the witch was removed or has used both
  potions; that cannot be hidden.

## Night: Narrator

The narrator's screen walks through the night one line at a time, with a Next button:
1. "Everyone close your eyes."
2. "Wolves, wake up and choose a victim." The narrator taps the player the wolves point at.
3. "Seer, wake up and point at a player." The narrator taps them and sees Wolf / Not a wolf
   to show with a thumb.
4. "Doctor, wake up and choose who to protect." The narrator taps them.
5. "Witch, wake up." The screen shows the victim; the narrator taps Heal, Poison (then a
   player) or Nothing: one potion per night, as in Pass the phone.
6. "Everyone wake up."

Lines for roles not in the game are skipped. A role that is in the game but already removed is
still read out, marked "(removed: wait a moment, then go on)", so the table cannot tell.

## Morning, day and vote

- **Morning:** who was removed in the night, or "Nobody was removed tonight", with roles when
  that setting is on. A removed hunter shoots now: the phone holder taps the hunter's choice.
  Then the win check.
- **Day:** living and removed players listed in their colours, the optional discussion
  timer, and **Vote**.
- **Vote:** the table decides aloud; the phone holder taps the removed player or **Nobody**.
  The role is shown when that setting is on; a hunter shoots; then the win check, then the
  next night.
- **End screen:** the winning side in large type, every player with their role, **Play
  again** (same players and settings: This game screen, new deal) and **New game** (setup).

## Code structure

- `shared/wolf-game.ts`: types, setup defaults and validation, `suggestWolves`,
  `parseSavedSetup`, `dealRoles(setup, rng)`, night resolution, win check, and a pure reducer.
  Phases: `setup → rules → deal → night → morning → day → end`; night and morning keep their
  own sub-steps (lap, visit, narrator line, pending hunter shot). Actions carry their time
  (`at`) and use Imposter's tap guard; random choices take an `Rng`, as in Imposter. Countdown
  helpers come from `shared/imposter.ts`.
- `shared/i18n.ts`: all strings in TR and EN, including the role descriptions.
- Web: `src/app/games/wolf/page.tsx` in `GamesShell`; components in
  `src/components/games/wolf/` inside `GameFrame`, reusing `DealTurn` and `PassPhone`; a new
  entry on `src/app/games/page.tsx`; `src/lib/wolf-game.ts` re-exports the shared module.
- Mobile: `mobile/src/app/games/wolf.tsx` with `useEnterGameModeOnce` / `GamesPinSetup` like
  `imposter.tsx`; components in `mobile/src/components/games/wolf/` in `GameScreen` with
  `tone="game"`, reusing `DealTurn` and `PassPhone`; a new entry on
  `mobile/src/app/games/index.tsx`; `mobile/src/lib/wolf-game-storage.ts` for the setup.
- Offline web: `/games/wolf` added to `GAMES_PAGES` in `src/lib/games-offline.ts` and
  `public/sw.js`; the two lists must match. `GAMES_CACHE` lives only in
  `src/lib/games-offline.ts` and goes one version above what `main` has when this branch
  merges (Describe It also bumps it).
- Imposter's code is not changed, apart from reusing its components.

## Accessibility

- Every choice is a button with a role and a label; the hold card works with a screen reader
  as in Imposter.
- Colours are never the only signal: names are always written.

## Testing

- `src/lib/wolf-game.test.ts`: setup validation and wolf suggestion; dealing (counts, every
  role once, wolves told about each other); night resolution for every combination (doctor
  save, heal, poison, only one potion per night, doctor's repeat rule, wolf tie); hunter shots
  at night and after a vote, including a hunter shot that ends the game; both win conditions
  and the simultaneous case; the witch lap only when a potion is left; narrator mode steps
  including lines read for removed roles; tap guard.
- Screens on both platforms with the existing component test harness (web
  `src/components/games/wolf/*.test.ts`, mobile `mobile/src/lib/wolf-*.test.ts`), including
  that the This game screen lists exactly the roles in play and appears before every deal.
- Before the owner's device check: web build, the single-React bundle check, and the adb
  launch check when the phone is attached.

## Delivery

- Branch `feature/wolf-game`, from `feature/imposter-visuals`, in the worktree
  `.claude/worktrees/wolf-game`. Its PR targets `main` once PR #12 is merged.
- Code is written task by task by one implementer agent, then reviewed.
- Pushing, opening the PR, publishing to the phone and merging each need the owner's OK.
- Mobile ships as an `eas update`: no native module is added.
