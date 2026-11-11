# Imposter Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pass-and-play Imposter party game on web (`/games`, `/games/imposter`) and mobile (`games`, `games/imposter`), playable offline.

**Architecture:** All rules, the word list, the game state machine and the saved-settings parser live in `shared/` as plain TypeScript (no JSX), re-exported to the web through a one-line `src/lib/imposter.ts` shim and consumed by mobile as `@ptracker/shared/imposter`. Each platform only renders the reducer's state. Web offline support is a small `fetch` handler in `public/sw.js` plus a page-side cache warm-up.

**Tech Stack:** Next.js 16 (App Router, client components, Tailwind), Expo SDK 57 + Expo Router + NativeWind, vitest (node env), service worker Cache API.

**Spec:** `docs/superpowers/specs/2026-11-11-imposter-game-design.md`

**Branch:** `feature/imposter-game` (already created; the spec is committed).

**Ground rules for every task**
- `shared/` files must not contain JSX (mobile's babel rewrites them and Metro cannot resolve the runtime from outside `mobile/`).
- New i18n keys go into BOTH `en` and `tr` in `shared/i18n.ts` (a parity test enforces it).
- Mobile screens use `bg-surface`, never `bg-white`.
- Before writing web code, read `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`, `04-linking-and-navigating.md` and `05-server-and-client-components.md` (see `AGENTS.md`: this Next version differs from training data).
- Before writing mobile code, skim https://docs.expo.dev/versions/v57.0.0/ for Expo Router `Stack` and `expo-symbols` (`mobile/AGENTS.md`).
- Commit messages: conventional commits, no ticket keys. Stage files by explicit path.

---

## File map

| File | Responsibility |
|---|---|
| `shared/imposter-words.ts` (new) | Category ids and TR/EN word pairs (data only) |
| `shared/imposter.ts` (new) | Setup type + validation, dealing, voting, scoring, reducer, saved-setup parser, countdown helpers |
| `src/lib/imposter.ts` (new) | `export *` shim for the web |
| `src/lib/imposter-words.test.ts` (new) | Word data integrity |
| `src/lib/imposter.test.ts` (new) | Rules + reducer + parser tests |
| `shared/i18n.ts` (modify) | New `games` / `imposter*` keys |
| `public/sw.js` (modify) | install precache, activate cleanup, fetch handler for games |
| `src/sw.test.ts` (modify) | Tests for the new handlers |
| `src/lib/games-offline.ts` (new) + test | Register SW and warm the games cache from the page |
| `src/app/games/page.tsx` (new) | Games list |
| `src/app/games/imposter/page.tsx` (new) | Imposter page shell |
| `src/components/games/*.tsx` (new) | Web game UI |
| `src/app/dashboard/page.tsx`, `src/app/economy/page.tsx`, `src/components/events/EventsHeader.tsx` (modify) | "Games" nav link |
| `mobile/src/lib/imposter-storage.ts` (new) + test | AsyncStorage load/save of the setup |
| `mobile/src/app/games/index.tsx`, `mobile/src/app/games/imposter.tsx` (new) | Mobile screens |
| `mobile/src/components/games/*.tsx` (new) | Mobile game UI |
| `mobile/src/app/_layout.tsx` (modify) | Register the two screens |
| `mobile/src/components/month-header.tsx`, `mobile/src/app/(app)/index.tsx` (modify) | Game-controller icon |

---

### Task 1: Word list

**Files:**
- Create: `shared/imposter-words.ts`
- Test: `src/lib/imposter-words.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/imposter-words.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { IMPOSTER_CATEGORIES, IMPOSTER_WORDS } from "../../shared/imposter-words";

describe("imposter word list", () => {
  it("has the six categories with at least 40 entries each", () => {
    expect([...IMPOSTER_CATEGORIES]).toEqual(["animals", "food", "jobs", "places", "objects", "sports"]);
    for (const category of IMPOSTER_CATEGORIES) {
      expect(IMPOSTER_WORDS[category].length).toBeGreaterThanOrEqual(40);
    }
  });

  it("fills word and pair in both languages, and word differs from pair", () => {
    for (const category of IMPOSTER_CATEGORIES) {
      for (const entry of IMPOSTER_WORDS[category]) {
        for (const lang of ["tr", "en"] as const) {
          expect(entry[lang].word.trim()).not.toBe("");
          expect(entry[lang].pair.trim()).not.toBe("");
          expect(entry[lang].word.toLocaleLowerCase()).not.toBe(entry[lang].pair.toLocaleLowerCase());
        }
      }
    }
  });

  it("has no duplicate word within a category per language", () => {
    for (const category of IMPOSTER_CATEGORIES) {
      for (const lang of ["tr", "en"] as const) {
        const words = IMPOSTER_WORDS[category].map((e) => e[lang].word.toLocaleLowerCase());
        expect(new Set(words).size).toBe(words.length);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/imposter-words.test.ts`
Expected: FAIL — cannot resolve `../../shared/imposter-words`.

- [ ] **Step 3: Write the word list**

`shared/imposter-words.ts`:

```ts
// Word pairs for the Imposter game. Each row is [tr word, tr pair, en word, en pair]; the
// pair is what an imposter sees in "similar word" mode, so it must be close to the word.

export const IMPOSTER_CATEGORIES = ["animals", "food", "jobs", "places", "objects", "sports"] as const;
export type ImposterCategory = (typeof IMPOSTER_CATEGORIES)[number];

export interface WordEntry {
  tr: { word: string; pair: string };
  en: { word: string; pair: string };
}

type Row = readonly [string, string, string, string];

function rows(list: Row[]): WordEntry[] {
  return list.map(([trWord, trPair, enWord, enPair]) => ({
    tr: { word: trWord, pair: trPair },
    en: { word: enWord, pair: enPair },
  }));
}

export const IMPOSTER_WORDS: Record<ImposterCategory, WordEntry[]> = {
  animals: rows([
    ["Kedi", "Köpek", "Cat", "Dog"],
    ["Aslan", "Kaplan", "Lion", "Tiger"],
    ["At", "Eşek", "Horse", "Donkey"],
    ["İnek", "Manda", "Cow", "Buffalo"],
    ["Tavuk", "Hindi", "Chicken", "Turkey"],
    ["Kartal", "Şahin", "Eagle", "Hawk"],
    ["Yunus", "Balina", "Dolphin", "Whale"],
    ["Köpekbalığı", "Ahtapot", "Shark", "Octopus"],
    ["Fil", "Gergedan", "Elephant", "Rhino"],
    ["Zürafa", "Deve", "Giraffe", "Camel"],
    ["Maymun", "Goril", "Monkey", "Gorilla"],
    ["Ayı", "Kurt", "Bear", "Wolf"],
    ["Tilki", "Çakal", "Fox", "Jackal"],
    ["Tavşan", "Sincap", "Rabbit", "Squirrel"],
    ["Fare", "Hamster", "Mouse", "Hamster"],
    ["Yılan", "Kertenkele", "Snake", "Lizard"],
    ["Kaplumbağa", "Salyangoz", "Turtle", "Snail"],
    ["Kurbağa", "Semender", "Frog", "Salamander"],
    ["Arı", "Eşek arısı", "Bee", "Wasp"],
    ["Kelebek", "Güve", "Butterfly", "Moth"],
    ["Karınca", "Termit", "Ant", "Termite"],
    ["Örümcek", "Akrep", "Spider", "Scorpion"],
    ["Penguen", "Martı", "Penguin", "Seagull"],
    ["Baykuş", "Yarasa", "Owl", "Bat"],
    ["Papağan", "Muhabbet kuşu", "Parrot", "Budgie"],
    ["Koyun", "Keçi", "Sheep", "Goat"],
    ["Domuz", "Yaban domuzu", "Pig", "Boar"],
    ["Ördek", "Kaz", "Duck", "Goose"],
    ["Timsah", "Su aygırı", "Crocodile", "Hippo"],
    ["Zebra", "Antilop", "Zebra", "Antelope"],
    ["Kanguru", "Koala", "Kangaroo", "Koala"],
    ["Panda", "Rakun", "Panda", "Raccoon"],
    ["Leopar", "Çita", "Leopard", "Cheetah"],
    ["Geyik", "Ceylan", "Deer", "Gazelle"],
    ["Kirpi", "Köstebek", "Hedgehog", "Mole"],
    ["Fok", "Mors", "Seal", "Walrus"],
    ["Flamingo", "Leylek", "Flamingo", "Stork"],
    ["Tavus kuşu", "Sülün", "Peacock", "Pheasant"],
    ["Denizanası", "Denizyıldızı", "Jellyfish", "Starfish"],
    ["Sivrisinek", "Sinek", "Mosquito", "Fly"],
  ]),
  food: rows([
    ["Pizza", "Lahmacun", "Pizza", "Flatbread"],
    ["Hamburger", "Döner", "Burger", "Doner kebab"],
    ["Elma", "Armut", "Apple", "Pear"],
    ["Muz", "Ananas", "Banana", "Pineapple"],
    ["Çilek", "Kiraz", "Strawberry", "Cherry"],
    ["Karpuz", "Kavun", "Watermelon", "Melon"],
    ["Portakal", "Mandalina", "Orange", "Tangerine"],
    ["Limon", "Greyfurt", "Lemon", "Grapefruit"],
    ["Domates", "Biber", "Tomato", "Pepper"],
    ["Patates", "Havuç", "Potato", "Carrot"],
    ["Soğan", "Sarımsak", "Onion", "Garlic"],
    ["Ekmek", "Simit", "Bread", "Bagel"],
    ["Peynir", "Tereyağı", "Cheese", "Butter"],
    ["Süt", "Ayran", "Milk", "Buttermilk"],
    ["Yumurta", "Omlet", "Egg", "Omelette"],
    ["Pilav", "Makarna", "Rice", "Pasta"],
    ["Çorba", "Güveç", "Soup", "Stew"],
    ["Baklava", "Künefe", "Baklava", "Kunefe"],
    ["Dondurma", "Puding", "Ice cream", "Pudding"],
    ["Çikolata", "Karamela", "Chocolate", "Caramel"],
    ["Kek", "Kurabiye", "Cake", "Cookie"],
    ["Bal", "Reçel", "Honey", "Jam"],
    ["Çay", "Kahve", "Tea", "Coffee"],
    ["Kola", "Gazoz", "Cola", "Soda"],
    ["Mantı", "Ravioli", "Dumplings", "Ravioli"],
    ["Köfte", "Sucuk", "Meatball", "Sausage"],
    ["Tost", "Sandviç", "Toastie", "Sandwich"],
    ["Salata", "Cacık", "Salad", "Tzatziki"],
    ["Balık", "Karides", "Fish", "Shrimp"],
    ["Biftek", "Pirzola", "Steak", "Lamb chop"],
    ["Patlamış mısır", "Cips", "Popcorn", "Crisps"],
    ["Üzüm", "İncir", "Grape", "Fig"],
    ["Şeftali", "Kayısı", "Peach", "Apricot"],
    ["Ceviz", "Fındık", "Walnut", "Hazelnut"],
    ["Mercimek", "Nohut", "Lentil", "Chickpea"],
    ["Börek", "Poğaça", "Savory pie", "Bun"],
    ["Waffle", "Krep", "Waffle", "Pancake"],
    ["Zeytin", "Turşu", "Olive", "Pickle"],
    ["Ketçap", "Mayonez", "Ketchup", "Mayonnaise"],
    ["Avokado", "Mango", "Avocado", "Mango"],
  ]),
  jobs: rows([
    ["Doktor", "Hemşire", "Doctor", "Nurse"],
    ["Öğretmen", "Müdür", "Teacher", "Principal"],
    ["Polis", "Bekçi", "Police officer", "Security guard"],
    ["İtfaiyeci", "Sağlık görevlisi", "Firefighter", "Paramedic"],
    ["Aşçı", "Garson", "Chef", "Waiter"],
    ["Pilot", "Hostes", "Pilot", "Flight attendant"],
    ["Avukat", "Hakim", "Lawyer", "Judge"],
    ["Mühendis", "Mimar", "Engineer", "Architect"],
    ["Diş hekimi", "Eczacı", "Dentist", "Pharmacist"],
    ["Berber", "Kuaför", "Barber", "Hairdresser"],
    ["Fırıncı", "Pastacı", "Baker", "Pastry chef"],
    ["Kasap", "Manav", "Butcher", "Greengrocer"],
    ["Çiftçi", "Çoban", "Farmer", "Shepherd"],
    ["Balıkçı", "Denizci", "Fisherman", "Sailor"],
    ["Ressam", "Heykeltıraş", "Painter", "Sculptor"],
    ["Şarkıcı", "Dansçı", "Singer", "Dancer"],
    ["Oyuncu", "Yönetmen", "Actor", "Director"],
    ["Gazeteci", "Yazar", "Journalist", "Writer"],
    ["Fotoğrafçı", "Kameraman", "Photographer", "Camera operator"],
    ["Asker", "Bekçi", "Soldier", "Guard"],
    ["Taksici", "Otobüs şoförü", "Taxi driver", "Bus driver"],
    ["Postacı", "Kurye", "Postman", "Courier"],
    ["Elektrikçi", "Tesisatçı", "Electrician", "Plumber"],
    ["Marangoz", "Duvar ustası", "Carpenter", "Bricklayer"],
    ["Terzi", "Modacı", "Tailor", "Fashion designer"],
    ["Veteriner", "Hayvan bakıcısı", "Vet", "Zookeeper"],
    ["Astronot", "Astronom", "Astronaut", "Astronomer"],
    ["Bilim insanı", "Mucit", "Scientist", "Inventor"],
    ["Programcı", "Tasarımcı", "Programmer", "Designer"],
    ["Muhasebeci", "Bankacı", "Accountant", "Banker"],
    ["Kasiyer", "Satış danışmanı", "Cashier", "Shop assistant"],
    ["Futbolcu", "Hakem", "Football player", "Referee"],
    ["Psikolog", "Psikiyatrist", "Psychologist", "Psychiatrist"],
    ["Kaptan", "Denizci", "Captain", "Sailor"],
    ["Sihirbaz", "Palyaço", "Magician", "Clown"],
    ["Dedektif", "Casus", "Detective", "Spy"],
    ["Kütüphaneci", "Arşivci", "Librarian", "Archivist"],
    ["Rehber", "Seyahat acentesi", "Tour guide", "Travel agent"],
    ["Bahçıvan", "Çiçekçi", "Gardener", "Florist"],
    ["Temizlikçi", "Kapıcı", "Cleaner", "Janitor"],
  ]),
  places: rows([
    ["Hastane", "Eczane", "Hospital", "Pharmacy"],
    ["Okul", "Üniversite", "School", "University"],
    ["Havalimanı", "Tren garı", "Airport", "Train station"],
    ["Plaj", "Havuz", "Beach", "Swimming pool"],
    ["Sinema", "Tiyatro", "Cinema", "Theatre"],
    ["Restoran", "Kafe", "Restaurant", "Café"],
    ["Kütüphane", "Kitapçı", "Library", "Bookshop"],
    ["Müze", "Sanat galerisi", "Museum", "Art gallery"],
    ["Park", "Bahçe", "Park", "Garden"],
    ["Market", "Pazar", "Supermarket", "Bazaar"],
    ["Banka", "Postane", "Bank", "Post office"],
    ["Stadyum", "Spor salonu", "Stadium", "Gym"],
    ["Hayvanat bahçesi", "Akvaryum", "Zoo", "Aquarium"],
    ["Lunapark", "Sirk", "Amusement park", "Circus"],
    ["Otel", "Pansiyon", "Hotel", "Guesthouse"],
    ["Cami", "Kilise", "Mosque", "Church"],
    ["Kale", "Saray", "Castle", "Palace"],
    ["Orman", "Dağ", "Forest", "Mountain"],
    ["Çöl", "Vaha", "Desert", "Oasis"],
    ["Ada", "Yarımada", "Island", "Peninsula"],
    ["Göl", "Nehir", "Lake", "River"],
    ["Mağara", "Tünel", "Cave", "Tunnel"],
    ["Liman", "İskele", "Harbour", "Pier"],
    ["Köprü", "Üst geçit", "Bridge", "Overpass"],
    ["Hapishane", "Karakol", "Prison", "Police station"],
    ["Mahkeme", "Belediye", "Courthouse", "Town hall"],
    ["Fabrika", "Atölye", "Factory", "Workshop"],
    ["Ofis", "Toplantı odası", "Office", "Meeting room"],
    ["Mutfak", "Kiler", "Kitchen", "Pantry"],
    ["Banyo", "Tuvalet", "Bathroom", "Toilet"],
    ["Yatak odası", "Salon", "Bedroom", "Living room"],
    ["Bodrum", "Çatı katı", "Basement", "Attic"],
    ["Kamp alanı", "Karavan parkı", "Campsite", "Caravan park"],
    ["Kayak merkezi", "Buz pisti", "Ski resort", "Ice rink"],
    ["Uzay istasyonu", "Rasathane", "Space station", "Observatory"],
    ["Benzin istasyonu", "Otopark", "Petrol station", "Car park"],
    ["Kuaför", "Berber dükkanı", "Hair salon", "Barbershop"],
    ["Düğün salonu", "Konser salonu", "Wedding hall", "Concert hall"],
    ["Gece kulübü", "Bar", "Nightclub", "Bar"],
    ["Şelale", "Kaynak", "Waterfall", "Spring"],
  ]),
  objects: rows([
    ["Telefon", "Tablet", "Phone", "Tablet"],
    ["Bilgisayar", "Daktilo", "Computer", "Typewriter"],
    ["Televizyon", "Radyo", "Television", "Radio"],
    ["Saat", "Takvim", "Clock", "Calendar"],
    ["Gözlük", "Lens", "Glasses", "Contact lenses"],
    ["Şemsiye", "Yağmurluk", "Umbrella", "Raincoat"],
    ["Anahtar", "Kilit", "Key", "Lock"],
    ["Cüzdan", "Çanta", "Wallet", "Handbag"],
    ["Kalem", "Silgi", "Pen", "Eraser"],
    ["Defter", "Kitap", "Notebook", "Book"],
    ["Makas", "Bıçak", "Scissors", "Knife"],
    ["Çatal", "Kaşık", "Fork", "Spoon"],
    ["Tabak", "Kase", "Plate", "Bowl"],
    ["Bardak", "Kupa", "Drinking glass", "Mug"],
    ["Yastık", "Battaniye", "Pillow", "Blanket"],
    ["Sandalye", "Tabure", "Chair", "Stool"],
    ["Masa", "Sehpa", "Table", "Coffee table"],
    ["Kanepe", "Koltuk", "Sofa", "Armchair"],
    ["Ayna", "Pencere", "Mirror", "Window"],
    ["Lamba", "Mum", "Lamp", "Candle"],
    ["Buzdolabı", "Çamaşır makinesi", "Fridge", "Washing machine"],
    ["Fırın", "Mikrodalga", "Oven", "Microwave"],
    ["Süpürge", "Paspas", "Vacuum cleaner", "Mop"],
    ["Diş fırçası", "Tarak", "Toothbrush", "Comb"],
    ["Havlu", "Bornoz", "Towel", "Bathrobe"],
    ["Sabun", "Şampuan", "Soap", "Shampoo"],
    ["Ayakkabı", "Terlik", "Shoes", "Slippers"],
    ["Şapka", "Bere", "Hat", "Beanie"],
    ["Eldiven", "Atkı", "Gloves", "Scarf"],
    ["Bisiklet", "Kaykay", "Bicycle", "Skateboard"],
    ["Top", "Balon", "Ball", "Balloon"],
    ["Gitar", "Keman", "Guitar", "Violin"],
    ["Kamera", "Dürbün", "Camera", "Binoculars"],
    ["Pil", "Şarj aleti", "Battery", "Charger"],
    ["Kulaklık", "Hoparlör", "Headphones", "Speaker"],
    ["Bavul", "Sırt çantası", "Suitcase", "Backpack"],
    ["Çekiç", "Tornavida", "Hammer", "Screwdriver"],
    ["Merdiven", "Asansör", "Ladder", "Elevator"],
    ["Kumanda", "Klavye", "Remote control", "Keyboard"],
    ["Ütü", "Saç kurutma makinesi", "Iron", "Hair dryer"],
  ]),
  sports: rows([
    ["Futbol", "Basketbol", "Football", "Basketball"],
    ["Voleybol", "Hentbol", "Volleyball", "Handball"],
    ["Tenis", "Masa tenisi", "Tennis", "Table tennis"],
    ["Yüzme", "Dalış", "Swimming", "Diving"],
    ["Koşu", "Yürüyüş", "Running", "Walking"],
    ["Bisiklet", "Motosiklet yarışı", "Cycling", "Motorcycle racing"],
    ["Boks", "Güreş", "Boxing", "Wrestling"],
    ["Judo", "Karate", "Judo", "Karate"],
    ["Kayak", "Snowboard", "Skiing", "Snowboarding"],
    ["Buz pateni", "Buz hokeyi", "Ice skating", "Ice hockey"],
    ["Golf", "Bilardo", "Golf", "Billiards"],
    ["Okçuluk", "Atıcılık", "Archery", "Shooting"],
    ["Eskrim", "Kendo", "Fencing", "Kendo"],
    ["Sörf", "Yelken", "Surfing", "Sailing"],
    ["Kürek", "Kano", "Rowing", "Canoeing"],
    ["Jimnastik", "Bale", "Gymnastics", "Ballet"],
    ["Halter", "Vücut geliştirme", "Weightlifting", "Bodybuilding"],
    ["Dağcılık", "Kaya tırmanışı", "Mountaineering", "Rock climbing"],
    ["Beyzbol", "Kriket", "Baseball", "Cricket"],
    ["Ragbi", "Amerikan futbolu", "Rugby", "American football"],
    ["Badminton", "Squash", "Badminton", "Squash"],
    ["Satranç", "Dama", "Chess", "Checkers"],
    ["Bowling", "Dart", "Bowling", "Darts"],
    ["Formula 1", "Ralli", "Formula 1", "Rally"],
    ["Maraton", "Triatlon", "Marathon", "Triathlon"],
    ["Yoga", "Pilates", "Yoga", "Pilates"],
    ["Su topu", "Senkronize yüzme", "Water polo", "Synchronised swimming"],
    ["Paraşüt", "Yamaç paraşütü", "Skydiving", "Paragliding"],
    ["Binicilik", "Polo", "Horse riding", "Polo"],
    ["Çim hokeyi", "Lakros", "Field hockey", "Lacrosse"],
    ["Kaykay", "Paten", "Skateboarding", "Roller skating"],
    ["Futsal", "Plaj futbolu", "Futsal", "Beach soccer"],
    ["Plaj voleybolu", "Plaj tenisi", "Beach volleyball", "Beach tennis"],
    ["Sumo", "Bilek güreşi", "Sumo", "Arm wrestling"],
    ["Taekwondo", "Kickboks", "Taekwondo", "Kickboxing"],
    ["Uzun atlama", "Yüksek atlama", "Long jump", "High jump"],
    ["Gülle atma", "Cirit atma", "Shot put", "Javelin"],
    ["Curling", "Kızak", "Curling", "Bobsleigh"],
    ["Su kayağı", "Jet ski", "Water skiing", "Jet skiing"],
    ["Frizbi", "Petank", "Frisbee", "Pétanque"],
  ]),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/imposter-words.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/imposter-words.ts src/lib/imposter-words.test.ts
git commit -m "feat(games): add imposter word list"
```

---

### Task 2: Game rules (setup, dealing, voting, scoring)

**Files:**
- Create: `shared/imposter.ts`, `src/lib/imposter.ts`
- Test: `src/lib/imposter.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/imposter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETUP,
  IMPOSTER_WORDS,
  applyScore,
  dealRound,
  maxImposters,
  pickEntry,
  tallyVotes,
  validateSetup,
  type ImposterSetup,
} from "@/lib/imposter";

const zero = () => 0;
// Returns the given values in order, then repeats the last one.
function seq(...values: number[]) {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const setup = (over: Partial<ImposterSetup> = {}): ImposterSetup => ({
  ...DEFAULT_SETUP,
  players: ["Ayşe", "Mehmet", "Can", "Deniz"],
  ...over,
});

describe("maxImposters", () => {
  it("keeps imposters a minority and caps at 3", () => {
    expect(maxImposters(2)).toBe(0);
    expect(maxImposters(3)).toBe(1);
    expect(maxImposters(4)).toBe(1);
    expect(maxImposters(5)).toBe(2);
    expect(maxImposters(7)).toBe(3);
    expect(maxImposters(12)).toBe(3);
  });
});

describe("validateSetup", () => {
  it("accepts a valid setup", () => {
    expect(validateSetup(setup())).toEqual([]);
  });

  it("flags too few and too many players", () => {
    expect(validateSetup(setup({ players: ["A", "B"] }))).toEqual(["tooFewPlayers"]);
    const thirteen = Array.from({ length: 13 }, (_, i) => `P${i}`);
    expect(validateSetup(setup({ players: thirteen }))).toContain("tooManyPlayers");
  });

  it("flags blank and duplicate names (trimmed, case-insensitive)", () => {
    expect(validateSetup(setup({ players: ["A", " ", "B"] }))).toContain("blankName");
    expect(validateSetup(setup({ players: ["Ali", "ali ", "B"] }))).toContain("duplicateName");
  });

  it("flags an imposter count above the limit", () => {
    expect(validateSetup(setup({ imposterCount: 2 }))).toEqual(["imposterCount"]);
    expect(validateSetup(setup({ imposterCount: 0 }))).toEqual(["imposterCount"]);
  });

  it("flags a scoreboard without voting", () => {
    expect(validateSetup(setup({ scoreboard: true, voting: false }))).toEqual(["scoreboardNeedsVoting"]);
  });
});

describe("pickEntry", () => {
  it("picks from the chosen category and records it as used", () => {
    const picked = pickEntry("food", [], zero);
    expect(picked).toEqual({ id: "food:0", category: "food", index: 0, used: ["food:0"] });
  });

  it("skips used entries", () => {
    expect(pickEntry("food", ["food:0"], zero).id).toBe("food:1");
  });

  it("resets only that category's used ids once it runs out", () => {
    const allFood = IMPOSTER_WORDS.food.map((_, i) => `food:${i}`);
    const picked = pickEntry("food", ["animals:3", ...allFood], zero);
    expect(picked.id).toBe("food:0");
    expect(picked.used).toEqual(["animals:3", "food:0"]);
  });

  it("draws from every category in mixed mode", () => {
    const total = Object.values(IMPOSTER_WORDS).reduce((n, list) => n + list.length, 0);
    expect(pickEntry("mixed", [], () => 0.999999).id).toBe(`sports:${IMPOSTER_WORDS.sports.length - 1}`);
    expect(pickEntry("mixed", [], zero).id).toBe("animals:0");
    expect(total).toBeGreaterThanOrEqual(240);
  });
});

describe("dealRound", () => {
  it("gives the word to the crew and the category to the imposter in no-word mode", () => {
    const { round, used } = dealRound(setup({ category: "animals" }), "tr", [], zero);
    expect(round.word).toBe("Kedi");
    expect(round.pair).toBe("Köpek");
    expect(round.imposters).toEqual([0]);
    expect(round.cards[0]).toEqual({ kind: "imposter", category: "animals" });
    expect(round.cards.slice(1)).toEqual([
      { kind: "word", text: "Kedi" },
      { kind: "word", text: "Kedi" },
      { kind: "word", text: "Kedi" },
    ]);
    expect(round.starter).toBe(0);
    expect(used).toEqual(["animals:0"]);
  });

  it("gives the imposter the pair word in similar-word mode, in the app language", () => {
    const { round } = dealRound(setup({ category: "animals", mode: "similar-word" }), "en", [], zero);
    expect(round.cards[0]).toEqual({ kind: "word", text: "Dog" });
    expect(round.cards[1]).toEqual({ kind: "word", text: "Cat" });
  });

  it("picks the requested number of distinct imposters and a starter in range", () => {
    const five = setup({ players: ["A", "B", "C", "D", "E"], imposterCount: 2 });
    // entry, imposter swap 1, imposter swap 2, starter
    const { round } = dealRound(five, "tr", [], seq(0, 0.99, 0.99, 0.5));
    expect(round.imposters).toHaveLength(2);
    expect(new Set(round.imposters).size).toBe(2);
    expect(round.imposters.every((i) => i >= 0 && i < 5)).toBe(true);
    expect(round.cards.filter((c) => c.kind === "imposter")).toHaveLength(2);
    expect(round.starter).toBe(2);
  });
});

describe("tallyVotes", () => {
  it("accuses the single top-voted player; crew wins if they are an imposter", () => {
    expect(tallyVotes([2, 2, 0, 2], 4, [2])).toEqual({ counts: [1, 0, 3, 0], accused: 2, crewWins: true });
  });

  it("imposters win when an innocent player is accused", () => {
    expect(tallyVotes([1, 0, 1, 1], 4, [2])).toMatchObject({ accused: 1, crewWins: false });
  });

  it("imposters win on a tie", () => {
    expect(tallyVotes([1, 0, 1, 0], 4, [2])).toMatchObject({ accused: null, crewWins: false });
  });
});

describe("applyScore", () => {
  it("gives every innocent +1 when the crew wins", () => {
    expect(applyScore([0, 0, 0, 0], [2], true)).toEqual([1, 1, 0, 1]);
  });

  it("gives every imposter +2 when the imposters win", () => {
    expect(applyScore([1, 1, 0, 1], [0, 2], false)).toEqual([3, 1, 2, 1]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/imposter.test.ts`
Expected: FAIL — cannot resolve `@/lib/imposter`.

- [ ] **Step 3: Implement the rules**

`shared/imposter.ts`:

```ts
import type { Lang } from "./i18n";
import { IMPOSTER_CATEGORIES, IMPOSTER_WORDS, type ImposterCategory } from "./imposter-words";

export { IMPOSTER_CATEGORIES, IMPOSTER_WORDS };
export type { ImposterCategory, WordEntry } from "./imposter-words";

export type ImposterMode = "no-word" | "similar-word";
export type CategoryChoice = ImposterCategory | "mixed";

export interface ImposterSetup {
  players: string[];
  mode: ImposterMode;
  category: CategoryChoice;
  imposterCount: number;
  /** 0 means the timer is off. */
  timerMinutes: number;
  voting: boolean;
  scoreboard: boolean;
}

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 12;
export const MAX_IMPOSTERS = 3;
export const MAX_TIMER_MINUTES = 10;
export const SETUP_STORAGE_KEY = "imposter_setup";

export const DEFAULT_SETUP: ImposterSetup = {
  players: [],
  mode: "no-word",
  category: "mixed",
  imposterCount: 1,
  timerMinutes: 0,
  voting: false,
  scoreboard: false,
};

export const CATEGORY_CHOICES: CategoryChoice[] = ["mixed", ...IMPOSTER_CATEGORIES];

export const CATEGORY_LABEL_KEYS = {
  mixed: "imposterCategoryMixed",
  animals: "imposterCategoryAnimals",
  food: "imposterCategoryFood",
  jobs: "imposterCategoryJobs",
  places: "imposterCategoryPlaces",
  objects: "imposterCategoryObjects",
  sports: "imposterCategorySports",
} as const satisfies Record<CategoryChoice, string>;

export type SetupError =
  | "tooFewPlayers"
  | "tooManyPlayers"
  | "blankName"
  | "duplicateName"
  | "imposterCount"
  | "scoreboardNeedsVoting";

export const SETUP_ERROR_KEYS = {
  tooFewPlayers: "imposterErrTooFew",
  tooManyPlayers: "imposterErrTooMany",
  blankName: "imposterErrBlank",
  duplicateName: "imposterErrDuplicate",
  imposterCount: "imposterErrCount",
  scoreboardNeedsVoting: "imposterErrScoreboard",
} as const satisfies Record<SetupError, string>;

type Rng = () => number;

// Imposters must stay a minority, and more than three stops being fun.
export function maxImposters(playerCount: number): number {
  return Math.max(0, Math.min(MAX_IMPOSTERS, Math.floor((playerCount - 1) / 2)));
}

export function validateSetup(setup: ImposterSetup): SetupError[] {
  const errors: SetupError[] = [];
  const names = setup.players.map((p) => p.trim());
  if (names.length < MIN_PLAYERS) errors.push("tooFewPlayers");
  if (names.length > MAX_PLAYERS) errors.push("tooManyPlayers");
  if (names.some((n) => n === "")) errors.push("blankName");
  const keys = names.filter((n) => n !== "").map((n) => n.toLocaleLowerCase());
  if (new Set(keys).size !== keys.length) errors.push("duplicateName");
  // With too few players the player error already explains it; do not add a second one.
  const limit = Math.max(1, maxImposters(names.length));
  if (setup.imposterCount < 1 || setup.imposterCount > limit) errors.push("imposterCount");
  if (setup.scoreboard && !setup.voting) errors.push("scoreboardNeedsVoting");
  return errors;
}

function pickIndex(length: number, rng: Rng): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}

export function pickEntry(
  choice: CategoryChoice,
  used: string[],
  rng: Rng
): { id: string; category: ImposterCategory; index: number; used: string[] } {
  const categories: readonly ImposterCategory[] = choice === "mixed" ? IMPOSTER_CATEGORIES : [choice];
  const pool = categories.flatMap((category) =>
    IMPOSTER_WORDS[category].map((_, index) => ({ id: `${category}:${index}`, category, index }))
  );
  let base = used;
  let available = pool.filter((p) => !used.includes(p.id));
  if (available.length === 0) {
    // Every word of this choice was played: start over, but keep other categories' history.
    const poolIds = new Set(pool.map((p) => p.id));
    base = used.filter((id) => !poolIds.has(id));
    available = pool;
  }
  const picked = available[pickIndex(available.length, rng)];
  return { ...picked, used: [...base, picked.id] };
}

function pickImposters(playerCount: number, count: number, rng: Rng): number[] {
  const pool = Array.from({ length: playerCount }, (_, i) => i);
  for (let i = 0; i < count; i++) {
    const j = i + pickIndex(playerCount - i, rng);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

export type Card = { kind: "word"; text: string } | { kind: "imposter"; category: ImposterCategory };

export interface Round {
  entryId: string;
  category: ImposterCategory;
  word: string;
  pair: string;
  imposters: number[];
  cards: Card[];
  starter: number;
}

export function dealRound(
  setup: ImposterSetup,
  lang: Lang,
  used: string[],
  rng: Rng
): { round: Round; used: string[] } {
  const playerCount = setup.players.length;
  const picked = pickEntry(setup.category, used, rng);
  const { word, pair } = IMPOSTER_WORDS[picked.category][picked.index][lang];
  const imposters = pickImposters(playerCount, setup.imposterCount, rng);
  const cards: Card[] = setup.players.map((_, i) => {
    if (!imposters.includes(i)) return { kind: "word", text: word };
    return setup.mode === "similar-word"
      ? { kind: "word", text: pair }
      : { kind: "imposter", category: picked.category };
  });
  const starter = pickIndex(playerCount, rng);
  return {
    round: { entryId: picked.id, category: picked.category, word, pair, imposters, cards, starter },
    used: picked.used,
  };
}

/** `votes[voter]` is the index of the player that voter accused. */
export function tallyVotes(
  votes: number[],
  playerCount: number,
  imposters: number[]
): { counts: number[]; accused: number | null; crewWins: boolean } {
  const counts = Array.from({ length: playerCount }, () => 0);
  for (const target of votes) counts[target] += 1;
  const top = Math.max(...counts);
  const leaders = counts.flatMap((c, i) => (c === top ? [i] : []));
  const accused = leaders.length === 1 ? leaders[0] : null;
  return { counts, accused, crewWins: accused !== null && imposters.includes(accused) };
}

export function applyScore(scores: number[], imposters: number[], crewWins: boolean): number[] {
  return scores.map((score, i) => {
    const isImposter = imposters.includes(i);
    if (crewWins) return isImposter ? score : score + 1;
    return isImposter ? score + 2 : score;
  });
}
```

`src/lib/imposter.ts`:

```ts
export * from "../../shared/imposter";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/imposter.test.ts`
Expected: PASS. If `dealRound`'s "distinct imposters" test reports a starter other than 2, recount the rng consumption: entry (1 call), imposters (`imposterCount` calls), starter (1 call) — `seq(0, 0.99, 0.99, 0.5)` gives the starter `floor(0.5 * 5) = 2`.

- [ ] **Step 5: Commit**

```bash
git add shared/imposter.ts src/lib/imposter.ts src/lib/imposter.test.ts
git commit -m "feat(games): add imposter rules for setup, dealing, voting and scoring"
```

---

### Task 3: Game state machine, saved setup, countdown

**Files:**
- Modify: `shared/imposter.ts` (append)
- Test: `src/lib/imposter.test.ts` (append)

- [ ] **Step 1: Append the failing tests**

Add to the import list at the top of `src/lib/imposter.test.ts`: `formatCountdown, gameReducer, initialGameState, parseSavedSetup, remainingSeconds, type GameState`. Then append:

```ts
describe("gameReducer", () => {
  const started = (over: Partial<ImposterSetup> = {}): GameState =>
    gameReducer(initialGameState(), { type: "start", setup: setup({ category: "animals", ...over }), lang: "tr", rng: zero });

  function dealAll(state: GameState): GameState {
    let s = state;
    for (let i = 0; i < s.setup.players.length; i++) {
      s = gameReducer(s, { type: "reveal" });
      s = gameReducer(s, { type: "next" });
    }
    return s;
  }

  it("ignores start while the setup is invalid", () => {
    const s0 = initialGameState();
    expect(gameReducer(s0, { type: "start", setup: setup({ players: ["A"] }), lang: "tr", rng: zero })).toBe(s0);
  });

  it("starts dealing with trimmed names, zero scores and the first player", () => {
    const s = gameReducer(initialGameState(), {
      type: "start",
      setup: setup({ players: [" Ayşe ", "Mehmet", "Can"] }),
      lang: "tr",
      rng: zero,
    });
    expect(s.phase).toBe("deal");
    expect(s.setup.players).toEqual(["Ayşe", "Mehmet", "Can"]);
    expect(s.scores).toEqual([0, 0, 0]);
    expect(s.turn).toBe(0);
    expect(s.revealed).toBe(false);
    expect(s.used).toHaveLength(1);
  });

  it("only passes the phone on after the card was shown", () => {
    const s = started();
    expect(gameReducer(s, { type: "next" })).toBe(s);
    const shown = gameReducer(s, { type: "reveal" });
    expect(gameReducer(shown, { type: "next" })).toMatchObject({ turn: 1, revealed: false, phase: "deal" });
  });

  it("moves to discussion after the last card", () => {
    expect(dealAll(started()).phase).toBe("discuss");
  });

  it("goes straight to the result without voting", () => {
    const s = gameReducer(dealAll(started()), { type: "finishDiscussion" });
    expect(s).toMatchObject({ phase: "result", outcome: null });
  });

  it("collects one secret vote per player, rejects self-votes, then scores", () => {
    // rng 0 makes player 0 the only imposter.
    let s = gameReducer(dealAll(started({ voting: true, scoreboard: true })), { type: "finishDiscussion" });
    expect(s.phase).toBe("vote");
    s = gameReducer(s, { type: "reveal" });
    expect(gameReducer(s, { type: "vote", target: 0 })).toBe(s); // player 0 voting for self
    s = gameReducer(s, { type: "vote", target: 1 });
    for (let voter = 1; voter < 4; voter++) {
      s = gameReducer(s, { type: "reveal" });
      s = gameReducer(s, { type: "vote", target: 0 });
    }
    expect(s.phase).toBe("result");
    expect(s.votes).toEqual([1, 0, 0, 0]);
    expect(s.outcome).toEqual({ accused: 0, crewWins: true });
    expect(s.scores).toEqual([0, 1, 1, 1]);
  });

  it("keeps players and scores for the next round and avoids the same word", () => {
    let s = gameReducer(dealAll(started({ voting: true, scoreboard: true })), { type: "finishDiscussion" });
    for (let voter = 0; voter < 4; voter++) {
      s = gameReducer(s, { type: "reveal" });
      s = gameReducer(s, { type: "vote", target: voter === 0 ? 1 : 0 });
    }
    const firstWord = s.round!.entryId;
    s = gameReducer(s, { type: "nextRound", lang: "tr", rng: zero });
    expect(s.phase).toBe("deal");
    expect(s.scores).toEqual([0, 1, 1, 1]);
    expect(s.round!.entryId).not.toBe(firstWord);
    expect(s.outcome).toBeNull();
  });

  it("ends back at setup, clearing scores but keeping the setup and used words", () => {
    const s = gameReducer(started(), { type: "end" });
    expect(s.phase).toBe("setup");
    expect(s.scores).toEqual([]);
    expect(s.setup.players).toEqual(["Ayşe", "Mehmet", "Can", "Deniz"]);
    expect(s.used).toHaveLength(1);
  });
});

describe("parseSavedSetup", () => {
  it("returns the defaults for missing or broken data", () => {
    expect(parseSavedSetup(null)).toEqual(DEFAULT_SETUP);
    expect(parseSavedSetup("{not json")).toEqual(DEFAULT_SETUP);
    expect(parseSavedSetup("42")).toEqual(DEFAULT_SETUP);
  });

  it("keeps valid fields and replaces invalid ones", () => {
    const raw = JSON.stringify({
      players: ["Ayşe", 7, "Can"],
      mode: "similar-word",
      category: "space",
      imposterCount: 9,
      timerMinutes: 5,
      voting: true,
      scoreboard: true,
    });
    expect(parseSavedSetup(raw)).toEqual({
      players: ["Ayşe", "Can"],
      mode: "similar-word",
      category: "mixed",
      imposterCount: 1,
      timerMinutes: 5,
      voting: true,
      scoreboard: true,
    });
  });

  it("drops the scoreboard when voting is off", () => {
    expect(parseSavedSetup(JSON.stringify({ voting: false, scoreboard: true })).scoreboard).toBe(false);
  });
});

describe("countdown helpers", () => {
  it("rounds remaining time up to whole seconds and never goes negative", () => {
    expect(remainingSeconds(10_000, 0)).toBe(10);
    expect(remainingSeconds(10_000, 9_001)).toBe(1);
    expect(remainingSeconds(10_000, 12_000)).toBe(0);
  });

  it("formats m:ss", () => {
    expect(formatCountdown(600)).toBe("10:00");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(0)).toBe("0:00");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/imposter.test.ts`
Expected: FAIL — `gameReducer` / `parseSavedSetup` / `remainingSeconds` are not exported.

- [ ] **Step 3: Append the implementation to `shared/imposter.ts`**

```ts
export type Phase = "setup" | "deal" | "discuss" | "vote" | "result";

export interface Outcome {
  accused: number | null;
  crewWins: boolean;
}

export interface GameState {
  phase: Phase;
  setup: ImposterSetup;
  round: Round | null;
  /** Whose turn it is to hold the phone, in deal and vote. */
  turn: number;
  /** Whether that player's card (deal) or ballot (vote) is showing. */
  revealed: boolean;
  votes: number[];
  scores: number[];
  /** Word ids played this session, so they do not come back too soon. */
  used: string[];
  outcome: Outcome | null;
}

export type GameAction =
  | { type: "start"; setup: ImposterSetup; lang: Lang; rng: Rng }
  | { type: "reveal" }
  | { type: "next" }
  | { type: "finishDiscussion" }
  | { type: "vote"; target: number }
  | { type: "nextRound"; lang: Lang; rng: Rng }
  | { type: "end" };

export function initialGameState(setup: ImposterSetup = DEFAULT_SETUP): GameState {
  return {
    phase: "setup",
    setup,
    round: null,
    turn: 0,
    revealed: false,
    votes: [],
    scores: [],
    used: [],
    outcome: null,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "start": {
      if (state.phase !== "setup" || validateSetup(action.setup).length > 0) return state;
      const setup = { ...action.setup, players: action.setup.players.map((p) => p.trim()) };
      const { round, used } = dealRound(setup, action.lang, state.used, action.rng);
      return {
        ...state,
        phase: "deal",
        setup,
        round,
        used,
        turn: 0,
        revealed: false,
        votes: [],
        outcome: null,
        scores: setup.players.map(() => 0),
      };
    }
    case "reveal":
      if (state.phase !== "deal" && state.phase !== "vote") return state;
      return { ...state, revealed: true };
    case "next": {
      if (state.phase !== "deal" || !state.revealed) return state;
      const turn = state.turn + 1;
      if (turn < state.setup.players.length) return { ...state, turn, revealed: false };
      return { ...state, phase: "discuss", turn: 0, revealed: false };
    }
    case "finishDiscussion":
      if (state.phase !== "discuss") return state;
      if (state.setup.voting) return { ...state, phase: "vote", turn: 0, revealed: false, votes: [] };
      return { ...state, phase: "result", outcome: null };
    case "vote": {
      if (state.phase !== "vote" || !state.revealed || !state.round) return state;
      const playerCount = state.setup.players.length;
      const { target } = action;
      if (!Number.isInteger(target) || target < 0 || target >= playerCount || target === state.turn) return state;
      const votes = [...state.votes, target];
      if (votes.length < playerCount) return { ...state, votes, turn: state.turn + 1, revealed: false };
      const { accused, crewWins } = tallyVotes(votes, playerCount, state.round.imposters);
      const scores = state.setup.scoreboard ? applyScore(state.scores, state.round.imposters, crewWins) : state.scores;
      return { ...state, phase: "result", votes, revealed: false, outcome: { accused, crewWins }, scores };
    }
    case "nextRound": {
      if (state.phase !== "result") return state;
      const { round, used } = dealRound(state.setup, action.lang, state.used, action.rng);
      return { ...state, phase: "deal", round, used, turn: 0, revealed: false, votes: [], outcome: null };
    }
    case "end":
      return { ...initialGameState(state.setup), used: state.used };
  }
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

// Saved settings come from device storage, which may hold an older shape or garbage:
// keep each field only if it is valid on its own.
export function parseSavedSetup(raw: string | null): ImposterSetup {
  if (!raw) return DEFAULT_SETUP;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_SETUP;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return DEFAULT_SETUP;
  const d = data as Record<string, unknown>;
  const players = Array.isArray(d.players)
    ? d.players.filter((p): p is string => typeof p === "string").slice(0, MAX_PLAYERS)
    : [];
  const category = CATEGORY_CHOICES.includes(d.category as CategoryChoice) ? (d.category as CategoryChoice) : "mixed";
  const voting = d.voting === true;
  return {
    players,
    mode: d.mode === "similar-word" ? "similar-word" : "no-word",
    category,
    imposterCount: isIntIn(d.imposterCount, 1, MAX_IMPOSTERS) ? d.imposterCount : 1,
    timerMinutes: isIntIn(d.timerMinutes, 0, MAX_TIMER_MINUTES) ? d.timerMinutes : 0,
    voting,
    scoreboard: voting && d.scoreboard === true,
  };
}

export function remainingSeconds(endsAt: number, now: number): number {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/imposter.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add shared/imposter.ts src/lib/imposter.test.ts
git commit -m "feat(games): add imposter game state machine and saved setup parser"
```

---

### Task 4: Translations

**Files:**
- Modify: `shared/i18n.ts` (end of `en` block after `themeDark: "Dark",` ~line 258; end of `tr` block after `themeDark: "Koyu",` ~line 502)

- [ ] **Step 1: Add the English keys** after `themeDark: "Dark",`:

```ts
    // Games
    games: "Games",
    gamesOffline: "Works without internet once opened.",
    imposterTitle: "Imposter",
    imposterDesc: "Everyone sees the secret word except the imposter. Talk it out and find them.",
    imposterPlayers: "Players",
    imposterAddPlayer: "Add player",
    imposterPlayerName: "Name",
    imposterRemovePlayer: "Remove",
    imposterMode: "Mode",
    imposterModeNoWord: "No word",
    imposterModeSimilar: "Similar word",
    imposterCategory: "Category",
    imposterCategoryMixed: "Mixed",
    imposterCategoryAnimals: "Animals",
    imposterCategoryFood: "Food",
    imposterCategoryJobs: "Jobs",
    imposterCategoryPlaces: "Places",
    imposterCategoryObjects: "Objects",
    imposterCategorySports: "Sports",
    imposterCount: "Number of imposters",
    imposterTimer: "Discussion timer",
    imposterTimerOff: "Off",
    imposterMinutes: "{n} min",
    imposterVoting: "Secret voting",
    imposterScoreboard: "Scoreboard",
    imposterScoreboardHint: "Needs secret voting",
    imposterStart: "Start",
    imposterErrTooFew: "Add at least 3 players",
    imposterErrTooMany: "At most 12 players",
    imposterErrBlank: "Every player needs a name",
    imposterErrDuplicate: "Names must be different",
    imposterErrCount: "Too many imposters for this many players",
    imposterErrScoreboard: "Turn on secret voting to keep score",
    imposterPassTo: "Pass the phone to {name}",
    imposterPassHint: "Make sure nobody else can see the screen.",
    imposterShow: "Show",
    imposterHideNext: "Hide, next",
    imposterYourWord: "Your word",
    imposterYouAre: "You are the imposter",
    imposterCategoryHint: "Category: {category}",
    imposterStarts: "{name} starts",
    imposterTimeUp: "Time's up",
    imposterGoVote: "Go to voting",
    imposterReveal: "Reveal the imposter",
    imposterOpenBallot: "Vote",
    imposterWhoIs: "Who is the imposter?",
    imposterAccused: "Most votes: {name}",
    imposterTie: "The votes are tied",
    imposterCrewWins: "The crew wins!",
    imposterImpostersWin: "The imposters win!",
    imposterTheWord: "Word",
    imposterThePair: "Imposter's word",
    imposterWere: "Imposters",
    imposterScores: "Scores",
    imposterNextRound: "Next round",
    imposterEnd: "End game",
```

- [ ] **Step 2: Add the Turkish keys** after `themeDark: "Koyu",`:

```ts
    // Games
    games: "Oyunlar",
    gamesOffline: "Bir kez açtıktan sonra internetsiz çalışır.",
    imposterTitle: "Imposter",
    imposterDesc: "Imposter dışında herkes gizli kelimeyi görür. Konuşun ve imposter'ı bulun.",
    imposterPlayers: "Oyuncular",
    imposterAddPlayer: "Oyuncu ekle",
    imposterPlayerName: "İsim",
    imposterRemovePlayer: "Kaldır",
    imposterMode: "Mod",
    imposterModeNoWord: "Kelimesiz",
    imposterModeSimilar: "Benzer kelime",
    imposterCategory: "Kategori",
    imposterCategoryMixed: "Karışık",
    imposterCategoryAnimals: "Hayvanlar",
    imposterCategoryFood: "Yiyecekler",
    imposterCategoryJobs: "Meslekler",
    imposterCategoryPlaces: "Yerler",
    imposterCategoryObjects: "Eşyalar",
    imposterCategorySports: "Spor",
    imposterCount: "Imposter sayısı",
    imposterTimer: "Tartışma süresi",
    imposterTimerOff: "Kapalı",
    imposterMinutes: "{n} dk",
    imposterVoting: "Gizli oylama",
    imposterScoreboard: "Puan tablosu",
    imposterScoreboardHint: "Gizli oylama açık olmalı",
    imposterStart: "Başla",
    imposterErrTooFew: "En az 3 oyuncu ekle",
    imposterErrTooMany: "En fazla 12 oyuncu olabilir",
    imposterErrBlank: "Her oyuncunun bir adı olmalı",
    imposterErrDuplicate: "İsimler birbirinden farklı olmalı",
    imposterErrCount: "Bu kadar oyuncu için imposter sayısı fazla",
    imposterErrScoreboard: "Puan tutmak için gizli oylamayı aç",
    imposterPassTo: "Telefonu {name} alsın",
    imposterPassHint: "Ekranı kimsenin görmediğinden emin ol.",
    imposterShow: "Göster",
    imposterHideNext: "Gizle, sıradaki",
    imposterYourWord: "Kelimen",
    imposterYouAre: "Imposter sensin",
    imposterCategoryHint: "Kategori: {category}",
    imposterStarts: "{name} başlıyor",
    imposterTimeUp: "Süre doldu",
    imposterGoVote: "Oylamaya geç",
    imposterReveal: "Imposter'ı göster",
    imposterOpenBallot: "Oy ver",
    imposterWhoIs: "Imposter kim?",
    imposterAccused: "En çok oy: {name}",
    imposterTie: "Oylar eşit çıktı",
    imposterCrewWins: "Oyuncular kazandı!",
    imposterImpostersWin: "Imposter'lar kazandı!",
    imposterTheWord: "Kelime",
    imposterThePair: "Imposter'ın kelimesi",
    imposterWere: "Imposter'lar",
    imposterScores: "Puanlar",
    imposterNextRound: "Sonraki tur",
    imposterEnd: "Oyunu bitir",
```

- [ ] **Step 3: Run the i18n parity tests and the type check**

Run: `npx vitest run src/lib/i18n.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors. (`CATEGORY_LABEL_KEYS` / `SETUP_ERROR_KEYS` values now exist as keys of `t`.)

- [ ] **Step 4: Commit**

```bash
git add shared/i18n.ts
git commit -m "feat(games): add games and imposter translations"
```

---

### Task 5: Web offline support (service worker)

**Files:**
- Modify: `public/sw.js`
- Modify: `src/sw.test.ts`
- Create: `src/lib/games-offline.ts`, `src/lib/games-offline.test.ts`

- [ ] **Step 1: Write the failing service-worker tests**

In `src/sw.test.ts`, extend `loadWorker` so the worker sees `caches`, `fetch`, `Response` and `skipWaiting`. Replace the existing `loadWorker` with:

```ts
type CacheMock = { addAll: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };

function loadWorker(
  windows: { url: string; focus: () => unknown; navigate?: (url: string) => Promise<unknown> }[] = [],
  net: { fetch?: (req: unknown) => Promise<unknown>; match?: (key: unknown) => Promise<unknown>; keys?: string[] } = {}
) {
  const handlers: Record<string, Handler> = {};
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const matchAll = vi.fn().mockResolvedValue(windows);
  const claim = vi.fn().mockResolvedValue(undefined);
  const skipWaiting = vi.fn().mockResolvedValue(undefined);
  const cache: CacheMock = { addAll: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    match: vi.fn(net.match ?? (() => Promise.resolve(undefined))),
    keys: vi.fn().mockResolvedValue(net.keys ?? []),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn(net.fetch ?? (() => Promise.reject(new Error("offline"))));
  const self = {
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
    skipWaiting,
    registration: { showNotification },
    location: { origin: ORIGIN },
    clients: { matchAll, openWindow, claim },
  };
  const ResponseStub = { error: () => ({ type: "error" }) };
  vm.runInNewContext(source, { self, URL, caches, fetch, Response: ResponseStub });
  return { handlers, showNotification, openWindow, matchAll, claim, skipWaiting, cache, caches, fetch };
}
```

Then append:

```ts
describe("sw.js games offline cache", () => {
  const ok = (body: string) => ({ ok: true, body, clone: () => ({ ok: true, body }) });

  function fetchEvent(url: string, init: { method?: string; mode?: string } = {}) {
    let responded: Promise<unknown> | undefined;
    const waits: Promise<unknown>[] = [];
    return {
      event: {
        request: { url, method: init.method ?? "GET", mode: init.mode ?? "no-cors" },
        respondWith: (p: Promise<unknown>) => {
          responded = p;
        },
        waitUntil: (p: Promise<unknown>) => {
          waits.push(p);
        },
      },
      responded: () => responded,
      settled: () => Promise.all(waits),
    };
  }

  it("precaches the games pages on install and activates at once", async () => {
    const { handlers, cache, skipWaiting } = loadWorker();
    let wait: Promise<unknown> = Promise.resolve();
    handlers.install({ waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
    expect(cache.addAll).toHaveBeenCalledWith(["/games", "/games/imposter"]);
    expect(skipWaiting).toHaveBeenCalled();
  });

  it("deletes old games caches on activate", async () => {
    const { handlers, caches } = loadWorker([], { keys: ["games-v0", "games-v1", "other"] });
    let wait: Promise<unknown> = Promise.resolve();
    handlers.activate({ waitUntil: (p: Promise<unknown>) => (wait = p) });
    await wait;
    expect(caches.delete).toHaveBeenCalledWith("games-v0");
    expect(caches.delete).not.toHaveBeenCalledWith("games-v1");
    expect(caches.delete).not.toHaveBeenCalledWith("other");
  });

  it("serves a games page from the network and refreshes the cache", async () => {
    const page = ok("<html>");
    const { handlers, cache } = loadWorker([], { fetch: () => Promise.resolve(page) });
    const e = fetchEvent(`${ORIGIN}/games/imposter`, { mode: "navigate" });
    handlers.fetch(e.event);
    expect(await e.responded()).toBe(page);
    await e.settled();
    expect(cache.put).toHaveBeenCalledWith("/games/imposter", { ok: true, body: "<html>" });
  });

  it("falls back to the cached games page when offline", async () => {
    const cached = { body: "cached" };
    const { handlers } = loadWorker([], { match: (key) => Promise.resolve(key === "/games" ? cached : undefined) });
    const e = fetchEvent(`${ORIGIN}/games`, { mode: "navigate" });
    handlers.fetch(e.event);
    expect(await e.responded()).toBe(cached);
  });

  it("serves static assets cache-first and stores misses", async () => {
    const asset = ok("js");
    const { handlers, cache, fetch } = loadWorker([], { fetch: () => Promise.resolve(asset) });
    const e = fetchEvent(`${ORIGIN}/_next/static/chunks/app.js`);
    handlers.fetch(e.event);
    expect(await e.responded()).toBe(asset);
    await e.settled();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalled();
  });

  it("leaves API calls, other pages, other origins and non-GET requests alone", () => {
    const { handlers } = loadWorker();
    for (const [url, init] of [
      [`${ORIGIN}/api/payments`, {}],
      [`${ORIGIN}/dashboard`, { mode: "navigate" }],
      ["https://cdn.example/_next/static/x.js", {}],
      [`${ORIGIN}/games`, { method: "POST", mode: "navigate" }],
    ] as const) {
      const e = fetchEvent(url, init);
      handlers.fetch(e.event);
      expect(e.responded()).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/sw.test.ts`
Expected: the old push tests PASS; the new "games offline cache" tests FAIL (`handlers.install` / `handlers.fetch` is not a function).

- [ ] **Step 3: Implement in `public/sw.js`**

Add at the top of the file (before the existing `activate` listener):

```js
// Games are meant to work offline. Only the games pages and Next's hashed static files
// are cached; every other request goes straight to the network as before.
const GAMES_CACHE = "games-v1";
const GAMES_PAGES = ["/games", "/games/imposter"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(GAMES_CACHE)
      .then((cache) => cache.addAll(GAMES_PAGES))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});
```

Replace the existing `activate` listener with:

```js
// Take over pages already open when the worker first installs, so a notification click
// can reuse them. Old games caches are dropped when GAMES_CACHE is bumped.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("games-") && k !== GAMES_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});
```

Add at the end of the file:

```js
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const store = (key, response) => {
    if (!response || !response.ok) return;
    const copy = response.clone();
    event.waitUntil(caches.open(GAMES_CACHE).then((cache) => cache.put(key, copy)));
  };

  if (request.mode === "navigate" && GAMES_PAGES.includes(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          store(url.pathname, response);
          return response;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || Response.error()))
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            store(request, response);
            return response;
          })
      )
    );
  }
});
```

- [ ] **Step 4: Run to verify all sw tests pass**

Run: `npx vitest run src/sw.test.ts`
Expected: PASS (old push/notificationclick tests and the new ones).

- [ ] **Step 5: Write the failing page-side helper test**

`src/lib/games-offline.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { GAMES_CACHE, GAMES_PAGES, gamesCacheUrls } from "@/lib/games-offline";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const sw = readFileSync(fileURLToPath(new URL("../../public/sw.js", import.meta.url)), "utf8");

describe("games offline helper", () => {
  it("uses the same cache name and pages as the service worker", () => {
    expect(sw).toContain(`const GAMES_CACHE = "${GAMES_CACHE}";`);
    expect(sw).toContain(`const GAMES_PAGES = ${JSON.stringify(GAMES_PAGES).replace(/,/g, ", ")};`);
  });

  it("lists the games pages plus the same-origin static files the page loaded", () => {
    const origin = "https://paytrack.example";
    const entries = [
      { name: `${origin}/_next/static/chunks/a.js` },
      { name: `${origin}/_next/static/media/font.woff2` },
      { name: `${origin}/api/auth/session` },
      { name: "https://other.example/_next/static/chunks/b.js" },
      { name: `${origin}/_next/static/chunks/a.js` },
    ];
    expect(gamesCacheUrls(entries, origin)).toEqual([
      "/games",
      "/games/imposter",
      "/_next/static/chunks/a.js",
      "/_next/static/media/font.woff2",
    ]);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/lib/games-offline.test.ts`
Expected: FAIL — cannot resolve `@/lib/games-offline`.

- [ ] **Step 7: Implement `src/lib/games-offline.ts`**

```ts
// Keeps the games playable offline. The service worker caches games pages and static
// files it sees, but the files of the very first visit were loaded before it was in
// control, so the page stores them itself. Must match GAMES_CACHE / GAMES_PAGES in sw.js.
export const GAMES_CACHE = "games-v1";
export const GAMES_PAGES = ["/games", "/games/imposter"];

export function gamesCacheUrls(entries: { name: string }[], origin: string): string[] {
  const assets = new Set<string>();
  for (const entry of entries) {
    let url: URL;
    try {
      url = new URL(entry.name);
    } catch {
      continue;
    }
    if (url.origin === origin && url.pathname.startsWith("/_next/static/")) assets.add(url.pathname);
  }
  return [...GAMES_PAGES, ...assets];
}

export async function prepareGamesOffline(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("caches" in window)) return;
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    const urls = gamesCacheUrls(performance.getEntriesByType("resource"), window.location.origin);
    const cache = await caches.open(GAMES_CACHE);
    await cache.addAll(urls);
  } catch {
    // Offline play is a bonus: a failure here must never break the game.
  }
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run src/lib/games-offline.test.ts src/sw.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add public/sw.js src/sw.test.ts src/lib/games-offline.ts src/lib/games-offline.test.ts
git commit -m "feat(web): cache the games pages for offline play"
```

---

### Task 6: Web game UI

**Files:**
- Create: `src/app/games/page.tsx`, `src/app/games/imposter/page.tsx`
- Create: `src/components/games/GamesShell.tsx`, `src/components/games/ImposterGame.tsx`, `src/components/games/ImposterSetupForm.tsx`, `src/components/games/PassPhone.tsx`, `src/components/games/ImposterDiscuss.tsx`, `src/components/games/ImposterResult.tsx`

These are client components verified by `tsc`, `lint`, `build` and a manual browser check; the logic they call is already tested.

- [ ] **Step 1: Read the Next docs this task depends on**

Read `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`, `04-linking-and-navigating.md` and `05-server-and-client-components.md`. Confirm a `"use client"` `page.tsx` is still allowed and that `<a>` (not `Link`) gives a full page load.

- [ ] **Step 2: Create `src/components/games/GamesShell.tsx`**

```tsx
"use client";

import { useEffect, type ReactNode } from "react";
import { ArrowLeft, Gamepad2 } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { prepareGamesOffline } from "@/lib/games-offline";

// Header + body for every games page. Plain <a> links on purpose: offline, a full page
// load is answered by the service worker, a client-side navigation is not.
export default function GamesShell({ title, backHref, children }: { title: string; backHref: string; children: ReactNode }) {
  const { t } = useLang();

  useEffect(() => {
    void prepareGamesOffline();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-surface border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <a href={backHref} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100" aria-label={t.back}>
            <ArrowLeft className="w-5 h-5" />
          </a>
          <Gamepad2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          <h1 className="font-bold text-gray-900">{title}</h1>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
```


- [ ] **Step 3: Create `src/app/games/page.tsx`**

```tsx
"use client";

import { ChevronRight, VenetianMask } from "lucide-react";
import GamesShell from "@/components/games/GamesShell";
import { useLang } from "@/lib/i18n";

export default function GamesPage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.games} backHref="/dashboard">
      <a
        href="/games/imposter"
        className="flex items-center gap-4 rounded-xl border border-gray-100 bg-surface p-4 hover:border-purple-200 transition"
      >
        <div className="rounded-lg bg-purple-50 p-3">
          <VenetianMask className="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-gray-900">{t.imposterTitle}</p>
          <p className="text-sm text-gray-500">{t.imposterDesc}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </a>
      <p className="mt-4 text-center text-xs text-gray-400">{t.gamesOffline}</p>
    </GamesShell>
  );
}
```


- [ ] **Step 4: Create `src/app/games/imposter/page.tsx`**

```tsx
"use client";

import GamesShell from "@/components/games/GamesShell";
import ImposterGame from "@/components/games/ImposterGame";
import { useLang } from "@/lib/i18n";

export default function ImposterPage() {
  const { t } = useLang();
  return (
    <GamesShell title={t.imposterTitle} backHref="/games">
      <ImposterGame />
    </GamesShell>
  );
}
```

- [ ] **Step 5: Create `src/components/games/ImposterSetupForm.tsx`**

```tsx
"use client";

import { X } from "lucide-react";
import { useLang } from "@/lib/i18n";
import {
  CATEGORY_CHOICES,
  CATEGORY_LABEL_KEYS,
  MAX_IMPOSTERS,
  MAX_PLAYERS,
  MAX_TIMER_MINUTES,
  SETUP_ERROR_KEYS,
  maxImposters,
  validateSetup,
  type CategoryChoice,
  type ImposterMode,
  type ImposterSetup,
} from "@/lib/imposter";

const pill = (active: boolean) =>
  `flex-1 rounded-md px-3 py-2 text-sm transition ${active ? "bg-surface font-semibold text-gray-900 shadow-sm" : "text-gray-500"}`;

export default function ImposterSetupForm({
  value,
  onChange,
  onStart,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
  onStart: () => void;
}) {
  const { t } = useLang();
  const errors = validateSetup(value);
  const limit = Math.max(1, maxImposters(value.players.length));
  const set = (patch: Partial<ImposterSetup>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-500">{t.imposterPlayers}</h2>
        {value.players.map((name, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={name}
              onChange={(e) => set({ players: value.players.map((p, j) => (j === i ? e.target.value : p)) })}
              placeholder={t.imposterPlayerName}
              className="flex-1 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-gray-900"
            />
            <button
              type="button"
              onClick={() => set({ players: value.players.filter((_, j) => j !== i) })}
              className="rounded-lg px-2 text-gray-400 hover:bg-gray-100"
              aria-label={t.imposterRemovePlayer}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={value.players.length >= MAX_PLAYERS}
          onClick={() => set({ players: [...value.players, ""] })}
          className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-50"
        >
          + {t.imposterAddPlayer}
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-500">{t.imposterMode}</h2>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {(["no-word", "similar-word"] as ImposterMode[]).map((mode) => (
            <button key={mode} type="button" className={pill(value.mode === mode)} onClick={() => set({ mode })}>
              {mode === "no-word" ? t.imposterModeNoWord : t.imposterModeSimilar}
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-500">{t.imposterCategory}</span>
          <select
            value={value.category}
            onChange={(e) => set({ category: e.target.value as CategoryChoice })}
            className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-gray-900"
          >
            {CATEGORY_CHOICES.map((c) => (
              <option key={c} value={c}>
                {t[CATEGORY_LABEL_KEYS[c]]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-gray-500">{t.imposterTimer}</span>
          <select
            value={value.timerMinutes}
            onChange={(e) => set({ timerMinutes: Number(e.target.value) })}
            className="w-full rounded-lg border border-gray-200 bg-surface px-3 py-2 text-gray-900"
          >
            {Array.from({ length: MAX_TIMER_MINUTES + 1 }, (_, m) => (
              <option key={m} value={m}>
                {m === 0 ? t.imposterTimerOff : t.imposterMinutes.replace("{n}", String(m))}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-gray-500">{t.imposterCount}</h2>
        <div className="flex rounded-lg bg-gray-100 p-1">
          {Array.from({ length: MAX_IMPOSTERS }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              disabled={n > limit}
              className={`${pill(value.imposterCount === n)} disabled:opacity-40`}
              onClick={() => set({ imposterCount: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-100 bg-surface p-4">
        <label className="flex items-center justify-between">
          <span className="text-gray-900">{t.imposterVoting}</span>
          <input
            type="checkbox"
            checked={value.voting}
            onChange={(e) => set({ voting: e.target.checked, scoreboard: e.target.checked && value.scoreboard })}
            className="h-5 w-5"
          />
        </label>
        <label className={`flex items-center justify-between ${value.voting ? "" : "opacity-50"}`}>
          <span>
            <span className="block text-gray-900">{t.imposterScoreboard}</span>
            {!value.voting && <span className="block text-xs text-gray-400">{t.imposterScoreboardHint}</span>}
          </span>
          <input
            type="checkbox"
            disabled={!value.voting}
            checked={value.scoreboard}
            onChange={(e) => set({ scoreboard: e.target.checked })}
            className="h-5 w-5"
          />
        </label>
      </section>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
          {errors.map((e) => (
            <li key={e}>{t[SETUP_ERROR_KEYS[e]]}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={errors.length > 0}
        onClick={onStart}
        className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {t.imposterStart}
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Create `src/components/games/PassPhone.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { useLang } from "@/lib/i18n";

// The hand-over screen used for dealing cards and for secret votes: the content only
// appears after the named player presses the button.
export default function PassPhone({
  name,
  revealed,
  revealLabel,
  onReveal,
  children,
}: {
  name: string;
  revealed: boolean;
  revealLabel: string;
  onReveal: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  if (revealed) return <div className="space-y-6 text-center">{children}</div>;
  return (
    <div className="space-y-6 py-10 text-center">
      <p className="text-2xl font-bold text-gray-900">{t.imposterPassTo.replace("{name}", name)}</p>
      <p className="text-sm text-gray-500">{t.imposterPassHint}</p>
      <button
        type="button"
        onClick={onReveal}
        className="rounded-lg bg-blue-600 px-10 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {revealLabel}
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Create `src/components/games/ImposterDiscuss.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { formatCountdown, remainingSeconds } from "@/lib/imposter";

export default function ImposterDiscuss({
  starter,
  timerMinutes,
  voting,
  onFinish,
}: {
  starter: string;
  timerMinutes: number;
  voting: boolean;
  onFinish: () => void;
}) {
  const { t } = useLang();
  const [endsAt] = useState(() => Date.now() + timerMinutes * 60_000);
  const [left, setLeft] = useState(timerMinutes * 60);

  useEffect(() => {
    if (timerMinutes === 0) return;
    const id = setInterval(() => setLeft(remainingSeconds(endsAt, Date.now())), 250);
    return () => clearInterval(id);
  }, [endsAt, timerMinutes]);

  return (
    <div className="space-y-6 py-6 text-center">
      <p className="text-2xl font-bold text-gray-900">{t.imposterStarts.replace("{name}", starter)}</p>
      {timerMinutes > 0 && (
        <p className={`text-5xl font-mono ${left === 0 ? "text-red-600" : "text-gray-900"}`}>
          {left === 0 ? t.imposterTimeUp : formatCountdown(left)}
        </p>
      )}
      <button
        type="button"
        onClick={onFinish}
        className="rounded-lg bg-blue-600 px-10 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {voting ? t.imposterGoVote : t.imposterReveal}
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Create `src/components/games/ImposterResult.tsx`**

```tsx
"use client";

import { useLang } from "@/lib/i18n";
import type { GameState } from "@/lib/imposter";

export default function ImposterResult({
  state,
  onNextRound,
  onEnd,
}: {
  state: GameState;
  onNextRound: () => void;
  onEnd: () => void;
}) {
  const { t } = useLang();
  const { round, outcome, setup, scores } = state;
  if (!round) return null;
  const names = setup.players;

  return (
    <div className="space-y-5 text-center">
      {outcome && (
        <div className="space-y-1">
          <p className="text-sm text-gray-500">
            {outcome.accused === null ? t.imposterTie : t.imposterAccused.replace("{name}", names[outcome.accused])}
          </p>
          <p className={`text-2xl font-bold ${outcome.crewWins ? "text-green-600" : "text-red-600"}`}>
            {outcome.crewWins ? t.imposterCrewWins : t.imposterImpostersWin}
          </p>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-gray-100 bg-surface p-4 text-left">
        <p className="text-gray-900">
          <span className="text-gray-500">{t.imposterTheWord}: </span>
          <b>{round.word}</b>
        </p>
        {setup.mode === "similar-word" && (
          <p className="text-gray-900">
            <span className="text-gray-500">{t.imposterThePair}: </span>
            <b>{round.pair}</b>
          </p>
        )}
        <p className="text-gray-900">
          <span className="text-gray-500">{t.imposterWere}: </span>
          <b>{round.imposters.map((i) => names[i]).join(", ")}</b>
        </p>
      </div>

      {setup.scoreboard && (
        <div className="rounded-xl border border-gray-100 bg-surface p-4 text-left">
          <p className="mb-2 text-sm font-medium text-gray-500">{t.imposterScores}</p>
          {names
            .map((name, i) => ({ name, score: scores[i] }))
            .sort((a, b) => b.score - a.score)
            .map(({ name, score }) => (
              <div key={name} className="flex justify-between py-1 text-gray-900">
                <span>{name}</span>
                <b>{score}</b>
              </div>
            ))}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onEnd}
          className="flex-1 rounded-lg border border-gray-200 py-3 text-gray-600 hover:bg-gray-100"
        >
          {t.imposterEnd}
        </button>
        <button
          type="button"
          onClick={onNextRound}
          className="flex-1 rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
        >
          {t.imposterNextRound}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create `src/components/games/ImposterGame.tsx`**

```tsx
"use client";

import { useEffect, useReducer, useState } from "react";
import { useLang } from "@/lib/i18n";
import {
  CATEGORY_LABEL_KEYS,
  DEFAULT_SETUP,
  SETUP_STORAGE_KEY,
  gameReducer,
  initialGameState,
  parseSavedSetup,
  type ImposterSetup,
} from "@/lib/imposter";
import ImposterSetupForm from "./ImposterSetupForm";
import PassPhone from "./PassPhone";
import ImposterDiscuss from "./ImposterDiscuss";
import ImposterResult from "./ImposterResult";

function loadSetup(): ImposterSetup {
  try {
    return parseSavedSetup(localStorage.getItem(SETUP_STORAGE_KEY));
  } catch {
    return DEFAULT_SETUP;
  }
}

function saveSetup(setup: ImposterSetup) {
  try {
    localStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Private mode or full storage: the game still runs, the names just are not remembered.
  }
}

export default function ImposterGame() {
  const { t, lang } = useLang();
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [draft, setDraft] = useState<ImposterSetup>(DEFAULT_SETUP);

  // Read after mount: localStorage does not exist during prerendering.
  useEffect(() => {
    setDraft(loadSetup());
  }, []);

  const { phase, setup, round, turn, revealed } = state;
  const names = setup.players;

  if (phase === "setup") {
    return (
      <ImposterSetupForm
        value={draft}
        onChange={setDraft}
        onStart={() => {
          saveSetup(draft);
          dispatch({ type: "start", setup: draft, lang, rng: Math.random });
        }}
      />
    );
  }

  if (!round) return null;

  if (phase === "deal") {
    const card = round.cards[turn];
    return (
      <PassPhone name={names[turn]} revealed={revealed} revealLabel={t.imposterShow} onReveal={() => dispatch({ type: "reveal" })}>
        {card.kind === "word" ? (
          <div className="space-y-2 py-6">
            <p className="text-sm text-gray-500">{t.imposterYourWord}</p>
            <p className="text-4xl font-bold text-gray-900">{card.text}</p>
          </div>
        ) : (
          <div className="space-y-2 py-6">
            <p className="text-3xl font-bold text-red-600">{t.imposterYouAre}</p>
            <p className="text-gray-500">
              {t.imposterCategoryHint.replace("{category}", t[CATEGORY_LABEL_KEYS[card.category]])}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => dispatch({ type: "next" })}
          className="rounded-lg bg-gray-900 px-10 py-3 font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
        >
          {t.imposterHideNext}
        </button>
      </PassPhone>
    );
  }

  if (phase === "discuss") {
    return (
      <ImposterDiscuss
        starter={names[round.starter]}
        timerMinutes={setup.timerMinutes}
        voting={setup.voting}
        onFinish={() => dispatch({ type: "finishDiscussion" })}
      />
    );
  }

  if (phase === "vote") {
    return (
      <PassPhone name={names[turn]} revealed={revealed} revealLabel={t.imposterOpenBallot} onReveal={() => dispatch({ type: "reveal" })}>
        <p className="text-xl font-bold text-gray-900">{t.imposterWhoIs}</p>
        <div className="grid grid-cols-2 gap-2">
          {names.map((name, i) =>
            i === turn ? null : (
              <button
                key={name}
                type="button"
                onClick={() => dispatch({ type: "vote", target: i })}
                className="rounded-lg border border-gray-200 bg-surface py-3 text-gray-900 hover:bg-gray-100"
              >
                {name}
              </button>
            )
          )}
        </div>
      </PassPhone>
    );
  }

  return (
    <ImposterResult
      state={state}
      onNextRound={() => dispatch({ type: "nextRound", lang, rng: Math.random })}
      onEnd={() => {
        setDraft(state.setup);
        dispatch({ type: "end" });
      }}
    />
  );
}
```

- [ ] **Step 10: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: no errors; the build output lists `/games` and `/games/imposter` as static (○) routes.

- [ ] **Step 11: Manual browser check**

Run `npm run dev`, open http://localhost:3000/games:
1. Card opens `/games/imposter`; add 4 names, Start, deal through all players (each sees a word or "You are the imposter" with the category).
2. Discuss screen names a starter; with a 1-min timer the countdown runs and shows "Time's up".
3. With voting + scoreboard: every player votes, result shows the winner and scores; "Next round" keeps scores and deals a new word; "End game" returns to setup with the names filled.
4. Reload: names and settings are remembered.

Offline check: `npm run build && npm start`, open http://localhost:3000/games then `/games/imposter` once, then in DevTools → Network choose "Offline" and reload both pages — they must still load and the game must play.

- [ ] **Step 12: Commit**

```bash
git add src/app/games/page.tsx src/app/games/imposter/page.tsx src/components/games/GamesShell.tsx src/components/games/ImposterGame.tsx src/components/games/ImposterSetupForm.tsx src/components/games/PassPhone.tsx src/components/games/ImposterDiscuss.tsx src/components/games/ImposterResult.tsx
git commit -m "feat(web): add games page and imposter game"
```

---

### Task 7: Web nav link

**Files:**
- Modify: `src/app/dashboard/page.tsx:239-244`, `src/app/economy/page.tsx:187-192`, `src/components/events/EventsHeader.tsx:39-44`

- [ ] **Step 1: Add the link** in each of the three files, right after the closing `</Link>` of the `href="/events"` link and before `</nav>`:

```tsx
            <Link
              href="/games"
              className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 transition font-medium"
            >
              {t.games}
            </Link>
```

(Match the indentation of the surrounding `<Link>` in each file.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run`
Expected: all green. In `npm run dev`, the "Games" link appears on Dashboard, Economy and Events and opens `/games`; on a phone-width window the nav row still fits without horizontal scroll (the header was fixed for that in an earlier PR — check it stays fixed).

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx src/app/economy/page.tsx src/components/events/EventsHeader.tsx
git commit -m "feat(web): link the games page from the top nav"
```

---

### Task 8: Mobile setup storage

**Files:**
- Create: `mobile/src/lib/imposter-storage.ts`
- Test: `mobile/src/lib/imposter-storage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getItem = vi.fn();
const setItem = vi.fn();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (...args: unknown[]) => getItem(...args),
    setItem: (...args: unknown[]) => setItem(...args),
  },
}));

import { DEFAULT_SETUP, SETUP_STORAGE_KEY } from "@ptracker/shared/imposter";
import { getStoredSetup, setStoredSetup } from "./imposter-storage";

beforeEach(() => {
  getItem.mockReset();
  setItem.mockReset();
});

describe("imposter setup storage", () => {
  it("reads and parses the saved setup", async () => {
    getItem.mockResolvedValue(JSON.stringify({ players: ["Ayşe", "Can", "Deniz"], voting: true }));
    const setup = await getStoredSetup();
    expect(getItem).toHaveBeenCalledWith(SETUP_STORAGE_KEY);
    expect(setup.players).toEqual(["Ayşe", "Can", "Deniz"]);
    expect(setup.voting).toBe(true);
  });

  it("falls back to the defaults when storage fails", async () => {
    getItem.mockRejectedValue(new Error("boom"));
    expect(await getStoredSetup()).toEqual(DEFAULT_SETUP);
  });

  it("writes JSON and swallows write errors", async () => {
    setItem.mockRejectedValue(new Error("full"));
    await expect(setStoredSetup(DEFAULT_SETUP)).resolves.toBeUndefined();
    expect(setItem).toHaveBeenCalledWith(SETUP_STORAGE_KEY, JSON.stringify(DEFAULT_SETUP));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd mobile && npx vitest run src/lib/imposter-storage.test.ts`
Expected: FAIL — cannot resolve `./imposter-storage`. (If `@ptracker/shared/imposter` itself fails to resolve, check `mobile/vitest.config.ts` aliases — it resolves other `@ptracker/shared/*` modules already, e.g. in `economy-storage.test.ts`.)

- [ ] **Step 3: Implement**

`mobile/src/lib/imposter-storage.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_SETUP, SETUP_STORAGE_KEY, parseSavedSetup, type ImposterSetup } from "@ptracker/shared/imposter";

// Remembers the player list and game settings. Fail-soft like language-storage.ts: a
// storage error means default settings, never a game that will not open.

export async function getStoredSetup(): Promise<ImposterSetup> {
  try {
    return parseSavedSetup(await AsyncStorage.getItem(SETUP_STORAGE_KEY));
  } catch {
    return DEFAULT_SETUP;
  }
}

export async function setStoredSetup(setup: ImposterSetup): Promise<void> {
  try {
    await AsyncStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify(setup));
  } catch {
    // Non-fatal: the game runs, the names just are not remembered.
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd mobile && npx vitest run src/lib/imposter-storage.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/imposter-storage.ts mobile/src/lib/imposter-storage.test.ts
git commit -m "feat(mobile): remember imposter game settings"
```

---

### Task 9: Mobile game UI

**Files:**
- Create: `mobile/src/components/games/game-screen.tsx`, `mobile/src/components/games/imposter-setup.tsx`, `mobile/src/components/games/pass-phone.tsx`, `mobile/src/components/games/imposter-discuss.tsx`, `mobile/src/components/games/imposter-result.tsx`
- Create: `mobile/src/app/games/index.tsx`, `mobile/src/app/games/imposter.tsx`
- Modify: `mobile/src/app/_layout.tsx` (inside the first `Stack.Protected`, after `event-expense`)
- Modify: `mobile/src/components/month-header.tsx`, `mobile/src/app/(app)/index.tsx`

- [ ] **Step 1: Create `mobile/src/components/games/game-screen.tsx`**

```tsx
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLang } from "@ptracker/shared/i18n";

// Header with a back action + scrolling body, shared by the games screens.
export function GameScreen({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useLang();
  const { top, bottom } = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-surface" style={{ paddingTop: top }}>
      <View className="flex-row items-center border-b border-gray-100 px-4 py-3">
        <Pressable onPress={() => router.back()} className="pr-3">
          <Text className="text-sm text-gray-500">‹ {t.back}</Text>
        </Pressable>
        <Text className="flex-1 text-center text-base font-semibold text-gray-900">{title}</Text>
        <View className="w-14" />
      </View>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 p-4"
        contentContainerStyle={{ paddingBottom: bottom + 16 }}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 2: Create `mobile/src/components/games/pass-phone.tsx`**

```tsx
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { PrimaryButton } from "@/components/ui/primary-button";

export function PassPhone({
  name,
  revealed,
  revealLabel,
  onReveal,
  children,
}: {
  name: string;
  revealed: boolean;
  revealLabel: string;
  onReveal: () => void;
  children: ReactNode;
}) {
  const { t } = useLang();
  if (revealed) return <View className="items-stretch gap-6 py-6">{children}</View>;
  return (
    <View className="items-center gap-6 py-16">
      <Text className="text-center text-2xl font-bold text-gray-900">{t.imposterPassTo.replace("{name}", name)}</Text>
      <Text className="text-center text-sm text-gray-500">{t.imposterPassHint}</Text>
      <View className="w-full">
        <PrimaryButton label={revealLabel} onPress={onReveal} />
      </View>
    </View>
  );
}
```

- [ ] **Step 3: Create `mobile/src/components/games/imposter-setup.tsx`**

```tsx
import { Pressable, Switch, Text, TextInput, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  CATEGORY_CHOICES,
  CATEGORY_LABEL_KEYS,
  MAX_IMPOSTERS,
  MAX_PLAYERS,
  MAX_TIMER_MINUTES,
  SETUP_ERROR_KEYS,
  maxImposters,
  validateSetup,
  type CategoryChoice,
  type ImposterMode,
  type ImposterSetup,
} from "@ptracker/shared/imposter";
import { Field, inputBoxClass } from "@/components/ui/field";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { SelectField } from "@/components/ui/select-field";

export function ImposterSetupForm({
  value,
  onChange,
  onStart,
}: {
  value: ImposterSetup;
  onChange: (next: ImposterSetup) => void;
  onStart: () => void;
}) {
  const { t } = useLang();
  const errors = validateSetup(value);
  const limit = Math.max(1, maxImposters(value.players.length));
  const set = (patch: Partial<ImposterSetup>) => onChange({ ...value, ...patch });

  return (
    <View className="gap-5">
      <Field label={t.imposterPlayers}>
        <View className="gap-2">
          {value.players.map((name, i) => (
            <View key={i} className="flex-row items-center gap-2">
              <TextInput
                className={`${inputBoxClass} flex-1`}
                value={name}
                onChangeText={(next) => set({ players: value.players.map((p, j) => (j === i ? next : p)) })}
                placeholder={t.imposterPlayerName}
                placeholderTextColor="#9ca3af"
              />
              <Pressable onPress={() => set({ players: value.players.filter((_, j) => j !== i) })} className="px-2 py-2">
                <Text className="text-lg text-gray-400">✕</Text>
              </Pressable>
            </View>
          ))}
          <Pressable
            disabled={value.players.length >= MAX_PLAYERS}
            onPress={() => set({ players: [...value.players, ""] })}
            className={`rounded-lg border border-dashed border-gray-300 py-2.5 ${value.players.length >= MAX_PLAYERS ? "opacity-50" : ""}`}>
            <Text className="text-center text-sm text-gray-500">+ {t.imposterAddPlayer}</Text>
          </Pressable>
        </View>
      </Field>

      <SegmentedToggle
        label={t.imposterMode}
        value={value.mode}
        options={[
          { value: "no-word", label: t.imposterModeNoWord },
          { value: "similar-word", label: t.imposterModeSimilar },
        ]}
        onChange={(mode) => set({ mode: mode as ImposterMode })}
      />

      <SelectField
        label={t.imposterCategory}
        value={value.category}
        options={CATEGORY_CHOICES.map((c) => ({ value: c, label: t[CATEGORY_LABEL_KEYS[c]] }))}
        onChange={(category) => set({ category: category as CategoryChoice })}
      />

      <SegmentedToggle
        label={t.imposterCount}
        value={String(value.imposterCount)}
        options={Array.from({ length: Math.min(MAX_IMPOSTERS, limit) }, (_, i) => ({
          value: String(i + 1),
          label: String(i + 1),
        }))}
        onChange={(n) => set({ imposterCount: Number(n) })}
      />

      <SelectField
        label={t.imposterTimer}
        value={String(value.timerMinutes)}
        options={Array.from({ length: MAX_TIMER_MINUTES + 1 }, (_, m) => ({
          value: String(m),
          label: m === 0 ? t.imposterTimerOff : t.imposterMinutes.replace("{n}", String(m)),
        }))}
        onChange={(m) => set({ timerMinutes: Number(m) })}
      />

      <View className="gap-3 rounded-xl border border-gray-100 p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-base text-gray-900">{t.imposterVoting}</Text>
          <Switch
            value={value.voting}
            onValueChange={(voting) => set({ voting, scoreboard: voting && value.scoreboard })}
          />
        </View>
        <View className={`flex-row items-center justify-between ${value.voting ? "" : "opacity-50"}`}>
          <View>
            <Text className="text-base text-gray-900">{t.imposterScoreboard}</Text>
            {!value.voting ? <Text className="text-xs text-gray-400">{t.imposterScoreboardHint}</Text> : null}
          </View>
          <Switch
            disabled={!value.voting}
            value={value.scoreboard}
            onValueChange={(scoreboard) => set({ scoreboard })}
          />
        </View>
      </View>

      {errors.length > 0 ? (
        <View className="gap-1 rounded-lg bg-amber-50 p-3">
          {errors.map((e) => (
            <Text key={e} className="text-sm text-amber-700">
              {t[SETUP_ERROR_KEYS[e]]}
            </Text>
          ))}
        </View>
      ) : null}

      <PrimaryButton label={t.imposterStart} onPress={onStart} disabled={errors.length > 0} />
    </View>
  );
}
```

Note: when the player count drops so that `imposterCount` exceeds the new limit, the segmented toggle shows no selected option and `validateSetup` reports `imposterCount`; tapping a valid number clears it.

- [ ] **Step 4: Create `mobile/src/components/games/imposter-discuss.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import { Text, Vibration, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { formatCountdown, remainingSeconds } from "@ptracker/shared/imposter";
import { PrimaryButton } from "@/components/ui/primary-button";

export function ImposterDiscuss({
  starter,
  timerMinutes,
  voting,
  onFinish,
}: {
  starter: string;
  timerMinutes: number;
  voting: boolean;
  onFinish: () => void;
}) {
  const { t } = useLang();
  const [endsAt] = useState(() => Date.now() + timerMinutes * 60_000);
  const [left, setLeft] = useState(timerMinutes * 60);
  const buzzed = useRef(false);

  useEffect(() => {
    if (timerMinutes === 0) return;
    const id = setInterval(() => setLeft(remainingSeconds(endsAt, Date.now())), 250);
    return () => clearInterval(id);
  }, [endsAt, timerMinutes]);

  useEffect(() => {
    if (timerMinutes > 0 && left === 0 && !buzzed.current) {
      buzzed.current = true;
      Vibration.vibrate(800);
    }
  }, [left, timerMinutes]);

  return (
    <View className="items-center gap-6 py-10">
      <Text className="text-center text-2xl font-bold text-gray-900">{t.imposterStarts.replace("{name}", starter)}</Text>
      {timerMinutes > 0 ? (
        <Text className={`text-5xl font-semibold ${left === 0 ? "text-red-600" : "text-gray-900"}`}>
          {left === 0 ? t.imposterTimeUp : formatCountdown(left)}
        </Text>
      ) : null}
      <View className="w-full">
        <PrimaryButton label={voting ? t.imposterGoVote : t.imposterReveal} onPress={onFinish} />
      </View>
    </View>
  );
}
```

- [ ] **Step 5: Create `mobile/src/components/games/imposter-result.tsx`**

```tsx
import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import type { GameState } from "@ptracker/shared/imposter";
import { PrimaryButton } from "@/components/ui/primary-button";

export function ImposterResult({
  state,
  onNextRound,
  onEnd,
}: {
  state: GameState;
  onNextRound: () => void;
  onEnd: () => void;
}) {
  const { t } = useLang();
  const { round, outcome, setup, scores } = state;
  if (!round) return null;
  const names = setup.players;

  return (
    <View className="gap-5">
      {outcome ? (
        <View className="items-center gap-1">
          <Text className="text-sm text-gray-500">
            {outcome.accused === null ? t.imposterTie : t.imposterAccused.replace("{name}", names[outcome.accused])}
          </Text>
          <Text className={`text-2xl font-bold ${outcome.crewWins ? "text-green-600" : "text-red-600"}`}>
            {outcome.crewWins ? t.imposterCrewWins : t.imposterImpostersWin}
          </Text>
        </View>
      ) : null}

      <View className="gap-2 rounded-xl border border-gray-100 p-4">
        <Text className="text-base text-gray-900">
          <Text className="text-gray-500">{t.imposterTheWord}: </Text>
          <Text className="font-bold">{round.word}</Text>
        </Text>
        {setup.mode === "similar-word" ? (
          <Text className="text-base text-gray-900">
            <Text className="text-gray-500">{t.imposterThePair}: </Text>
            <Text className="font-bold">{round.pair}</Text>
          </Text>
        ) : null}
        <Text className="text-base text-gray-900">
          <Text className="text-gray-500">{t.imposterWere}: </Text>
          <Text className="font-bold">{round.imposters.map((i) => names[i]).join(", ")}</Text>
        </Text>
      </View>

      {setup.scoreboard ? (
        <View className="rounded-xl border border-gray-100 p-4">
          <Text className="mb-2 text-sm font-medium text-gray-500">{t.imposterScores}</Text>
          {names
            .map((name, i) => ({ name, score: scores[i] }))
            .sort((a, b) => b.score - a.score)
            .map(({ name, score }) => (
              <View key={name} className="flex-row justify-between py-1">
                <Text className="text-base text-gray-900">{name}</Text>
                <Text className="text-base font-bold text-gray-900">{score}</Text>
              </View>
            ))}
        </View>
      ) : null}

      <PrimaryButton label={t.imposterNextRound} onPress={onNextRound} />
      <Pressable onPress={onEnd} className="py-2">
        <Text className="text-center text-sm text-gray-500">{t.imposterEnd}</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 6: Create `mobile/src/app/games/imposter.tsx`**

```tsx
import { useEffect, useReducer, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import {
  CATEGORY_LABEL_KEYS,
  gameReducer,
  initialGameState,
  type ImposterSetup,
} from "@ptracker/shared/imposter";
import { GameScreen } from "@/components/games/game-screen";
import { ImposterDiscuss } from "@/components/games/imposter-discuss";
import { ImposterResult } from "@/components/games/imposter-result";
import { ImposterSetupForm } from "@/components/games/imposter-setup";
import { PassPhone } from "@/components/games/pass-phone";
import { PrimaryButton } from "@/components/ui/primary-button";
import { getStoredSetup, setStoredSetup } from "@/lib/imposter-storage";

export default function ImposterScreen() {
  const { t, lang } = useLang();
  const [state, dispatch] = useReducer(gameReducer, undefined, () => initialGameState());
  const [draft, setDraft] = useState<ImposterSetup | null>(null);

  useEffect(() => {
    getStoredSetup().then(setDraft);
  }, []);

  const { phase, setup, round, turn, revealed } = state;
  const names = setup.players;

  let body: React.ReactNode = null;

  if (phase === "setup") {
    body = draft ? (
      <ImposterSetupForm
        value={draft}
        onChange={setDraft}
        onStart={() => {
          void setStoredSetup(draft);
          dispatch({ type: "start", setup: draft, lang, rng: Math.random });
        }}
      />
    ) : (
      <ActivityIndicator />
    );
  } else if (round && phase === "deal") {
    const card = round.cards[turn];
    body = (
      <PassPhone name={names[turn]} revealed={revealed} revealLabel={t.imposterShow} onReveal={() => dispatch({ type: "reveal" })}>
        {card.kind === "word" ? (
          <View className="items-center gap-2 py-8">
            <Text className="text-sm text-gray-500">{t.imposterYourWord}</Text>
            <Text className="text-center text-4xl font-bold text-gray-900">{card.text}</Text>
          </View>
        ) : (
          <View className="items-center gap-2 py-8">
            <Text className="text-center text-3xl font-bold text-red-600">{t.imposterYouAre}</Text>
            <Text className="text-gray-500">
              {t.imposterCategoryHint.replace("{category}", t[CATEGORY_LABEL_KEYS[card.category]])}
            </Text>
          </View>
        )}
        <PrimaryButton label={t.imposterHideNext} onPress={() => dispatch({ type: "next" })} />
      </PassPhone>
    );
  } else if (round && phase === "discuss") {
    body = (
      <ImposterDiscuss
        starter={names[round.starter]}
        timerMinutes={setup.timerMinutes}
        voting={setup.voting}
        onFinish={() => dispatch({ type: "finishDiscussion" })}
      />
    );
  } else if (round && phase === "vote") {
    body = (
      <PassPhone name={names[turn]} revealed={revealed} revealLabel={t.imposterOpenBallot} onReveal={() => dispatch({ type: "reveal" })}>
        <Text className="text-center text-xl font-bold text-gray-900">{t.imposterWhoIs}</Text>
        <View className="gap-2">
          {names.map((name, i) =>
            i === turn ? null : (
              <Pressable
                key={name}
                onPress={() => dispatch({ type: "vote", target: i })}
                className="rounded-lg border border-gray-200 py-3">
                <Text className="text-center text-base text-gray-900">{name}</Text>
              </Pressable>
            )
          )}
        </View>
      </PassPhone>
    );
  } else if (phase === "result") {
    body = (
      <ImposterResult
        state={state}
        onNextRound={() => dispatch({ type: "nextRound", lang, rng: Math.random })}
        onEnd={() => {
          setDraft(state.setup);
          dispatch({ type: "end" });
        }}
      />
    );
  }

  return <GameScreen title={t.imposterTitle}>{body}</GameScreen>;
}
```

- [ ] **Step 7: Create `mobile/src/app/games/index.tsx`**

```tsx
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useLang } from "@ptracker/shared/i18n";
import { GameScreen } from "@/components/games/game-screen";

export default function GamesScreen() {
  const { t } = useLang();
  return (
    <GameScreen title={t.games}>
      <Pressable
        onPress={() => router.push("/games/imposter")}
        className="flex-row items-center gap-4 rounded-xl border border-gray-100 p-4">
        <View className="rounded-lg bg-purple-50 p-3">
          <Text className="text-2xl">🕵️</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900">{t.imposterTitle}</Text>
          <Text className="text-sm text-gray-500">{t.imposterDesc}</Text>
        </View>
        <Text className="text-xl text-gray-400">›</Text>
      </Pressable>
    </GameScreen>
  );
}
```

- [ ] **Step 8: Register the screens in `mobile/src/app/_layout.tsx`**

Inside the first `<Stack.Protected guard={isAuthenticated}>`, after `<Stack.Screen name="event-expense" options={{ presentation: 'modal' }} />`, add:

```tsx
        <Stack.Screen name="games/index" />
        <Stack.Screen name="games/imposter" />
```

- [ ] **Step 9: Add the icon to the Payments header**

In `mobile/src/components/month-header.tsx`:
1. Add `import { SymbolView } from "expo-symbols";` to the imports.
2. Add an optional prop `onOpenGames?: () => void;` to the props type and destructure it.
3. Replace the view-toggle row (`<View className="mt-3 flex-row self-center rounded-lg bg-gray-100 p-0.5">…</View>`) with:

```tsx
      <View className="mt-3 flex-row items-center justify-center">
        <View className="flex-row rounded-lg bg-gray-100 p-0.5">
          {(["list", "calendar"] as const).map((v) => (
            <Pressable key={v} onPress={() => onToggleView(v)} className={`rounded-md px-4 py-1 ${view === v ? "bg-surface" : ""}`}>
              <Text className={view === v ? "font-medium text-gray-900" : "text-gray-500"}>
                {v === "list" ? t.viewList : t.viewCalendar}
              </Text>
            </Pressable>
          ))}
        </View>
        {onOpenGames ? (
          <Pressable onPress={onOpenGames} className="absolute right-0 p-1" accessibilityLabel={t.games}>
            <SymbolView
              name={{ ios: "gamecontroller", android: "sports_esports", web: "sports_esports" }}
              size={22}
              tintColor="#6b7280"
            />
          </Pressable>
        ) : null}
      </View>
```

In `mobile/src/app/(app)/index.tsx`, pass the prop to `<MonthHeader … />`:

```tsx
        onOpenGames={() => router.push("/games")}
```

- [ ] **Step 10: Verify the bundle and types**

Run: `cd mobile && npx tsc --noEmit && npx vitest run && npx expo export --platform android --output-dir /tmp/expo-export-check`
Expected: no type errors, all mobile tests pass, export finishes ("Exported: /tmp/expo-export-check"). `tsc` does not catch a JSX file under `shared/`; the export does — it must succeed.

- [ ] **Step 11: Commit**

```bash
git add mobile/src/components/games/game-screen.tsx mobile/src/components/games/imposter-setup.tsx mobile/src/components/games/pass-phone.tsx mobile/src/components/games/imposter-discuss.tsx mobile/src/components/games/imposter-result.tsx mobile/src/app/games/index.tsx mobile/src/app/games/imposter.tsx mobile/src/app/_layout.tsx mobile/src/components/month-header.tsx "mobile/src/app/(app)/index.tsx"
git commit -m "feat(mobile): add games screen and imposter game"
```

---

### Task 10: Final verification and roadmap

**Files:**
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Full root checks**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass; build lists `/games` and `/games/imposter`.

- [ ] **Step 2: Full mobile checks**

Run: `cd mobile && npx tsc --noEmit && npx vitest run && npx expo export --platform android --output-dir /tmp/expo-export-check`
Expected: all pass.

- [ ] **Step 3: Update the roadmap**

In `docs/roadmap.md`, replace the last bullet of the "Oyunlar bölümü" section (`- Hangi oyunların ekleneceği daha belli değil.`) with:

```markdown
- İlk oyun Imposter eklendi (web `/games`, mobilde Ödemeler başlığındaki ikon). Sıradaki oyunlar daha belli değil.
```

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap.md
git commit -m "docs: note the imposter game in the roadmap"
```

- [ ] **Step 5: Hand-off for the owner's device check**

Not done by the agent: the owner runs the mobile app on their Android device (`cd mobile && npx expo start --dev-client` on home Wi-Fi), plays one round in each mode, turns on airplane mode and plays again. Pushing and the PR go through `/push-gate:create-pr`.
