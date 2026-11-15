#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ENDPOINT = "https://query.wikidata.org/sparql";
const HEADERS = {
  "User-Agent": "who-game-candidates/1.0 (hobby script)",
  Accept: "application/sparql-results+json",
  "Content-Type": "application/x-www-form-urlencoded",
};
const PAUSE_MS = 1500;
const MAX_TRIES = 4;
const REQUEST_TIMEOUT_MS = 75_000;
const CHUNK_SIZE = 300;
const SMALL_CHUNK_SIZE = 60;
const OCCUPATION_DEPTH = 3;
const DETAILS_CHUNK = 150;
const LABELS_CHUNK = 400;

const TURKEY = ["Q43", "Q12560"];
const MAX_BIRTH_YEAR = 2008;
const FLOORS = { world: 20, tr: 4, characters: 8, myth: 4 };
const FIRST_ROUND_MARGIN = 1.15;

const PEOPLE_DOMAINS = [
  {
    id: "music",
    groups: [
      { id: "singers", roots: ["Q177220", "Q488205", "Q55960555", "Q2643890"], world: 420, tr: 380 },
      { id: "composers-conductors", roots: ["Q36834", "Q158852"], world: 200, tr: 80 },
      { id: "rappers-djs-producers", roots: ["Q2252262", "Q130857", "Q183945"], world: 120, tr: 60 },
      {
        id: "musicians",
        roots: ["Q639669", "Q753110", "Q855091", "Q486748", "Q386854", "Q584301", "Q1259917"],
        world: 160,
        tr: 80,
      },
    ],
  },
  {
    id: "screen",
    prune: ["Q9334029"],
    groups: [
      { id: "actors", roots: ["Q33999"], world: 600, tr: 400 },
      { id: "directors", roots: ["Q2526255"], world: 110, tr: 70 },
      {
        id: "comedians-presenters",
        roots: ["Q245068", "Q947873", "Q13590141", "Q44508716", "Q2722764", "Q15855449", "Q5716684"],
        world: 120,
        tr: 90,
      },
      { id: "models", roots: ["Q4610556"], world: 80, tr: 40 },
      {
        id: "internet",
        roots: ["Q17125263", "Q57414145", "Q2906862", "Q109459317", "Q15077007", "Q4379701"],
        world: 90,
        tr: 40,
        trBatch: "tr-other",
      },
    ],
  },
  {
    id: "sports",
    prune: ["Q476246", "Q1714828", "Q1365214", "Q11397897"],
    groups: [
      { id: "football", roots: ["Q937857"], world: 300, tr: 220 },
      { id: "basketball", roots: ["Q3665646"], world: 70, tr: 50 },
      { id: "tennis", roots: ["Q10833314"], world: 70, tr: 15 },
      { id: "athletics", roots: ["Q11513337"], world: 60, tr: 40 },
      { id: "motorsport", roots: ["Q10841764", "Q10349745", "Q378622", "Q3014296", "Q10842936"], world: 50, tr: 15 },
      {
        id: "combat",
        roots: ["Q11338576", "Q11607585", "Q13474373", "Q12369333", "Q6665249", "Q11124885", "Q13382533", "Q11296761", "Q9017214"],
        world: 70,
        tr: 80,
      },
      { id: "volleyball", roots: ["Q15117302"], world: 15, tr: 50 },
      { id: "swimming", roots: ["Q10843402"], world: 30, tr: 10 },
      { id: "gymnastics-skating", roots: ["Q16947675", "Q13381572", "Q13219587"], world: 40, tr: 15 },
      { id: "cycling", roots: ["Q2309784"], world: 30, tr: 5 },
      { id: "chess", roots: ["Q10873124"], world: 30, tr: 15 },
      { id: "us-sports", roots: ["Q10871364", "Q19204627", "Q11774891"], world: 50, tr: 0 },
      { id: "other-athletes", roots: ["Q2066131", "Q50995749"], world: 185, tr: 85 },
    ],
  },
  {
    id: "science",
    groups: [
      { id: "scientists", roots: ["Q901"], world: 400, tr: 60 },
      { id: "physicians", roots: ["Q39631"], world: 70, tr: 10 },
      { id: "inventors-engineers", roots: ["Q205375", "Q81096"], world: 120, tr: 10 },
      { id: "astronauts", roots: ["Q11631"], world: 40, tr: 2 },
      { id: "business", roots: ["Q131524", "Q43845"], world: 170, tr: 25 },
    ],
  },
  {
    id: "arts",
    groups: [
      { id: "writers", roots: ["Q36180", "Q6625963", "Q49757", "Q214917"], world: 380, tr: 170 },
      {
        id: "visual-artists",
        roots: ["Q1028181", "Q1281618", "Q33231", "Q3391743", "Q644687", "Q15296811", "Q7541856", "Q3303330"],
        world: 200,
        tr: 60,
      },
      { id: "comics-animation", roots: ["Q1114448", "Q715301", "Q191633", "Q266569"], world: 60, tr: 15 },
      { id: "architects-designers", roots: ["Q42973", "Q3501317", "Q5322166"], world: 100, tr: 30 },
      { id: "chefs", roots: ["Q3499072", "Q156839", "Q1191511"], world: 60, tr: 20 },
    ],
  },
  {
    id: "history",
    groups: [
      {
        id: "explorers-aviators",
        roots: ["Q11900058", "Q254651", "Q2095549", "Q12356615", "Q1734662", "Q476246"],
        world: 200,
        tr: 10,
      },
      { id: "philosophers", roots: ["Q4964182"], world: 200, tr: 10 },
      { id: "historians-scholars", roots: ["Q201788", "Q20826540", "Q270141"], world: 150, tr: 25 },
      {
        id: "reformers-humanitarians",
        roots: ["Q15253558", "Q12362622", "Q22336956", "Q186360", "Q1476215", "Q3578589"],
        world: 150,
        tr: 15,
      },
    ],
  },
];
const TR_BATCH_OF_DOMAIN = {
  music: "tr-music",
  screen: "tr-screen",
  sports: "tr-sports",
  science: "tr-other",
  arts: "tr-other",
  history: "tr-other",
};
const BIG_OCCUPATIONS = new Set([
  "Q937857", "Q33999", "Q10800557", "Q10798782", "Q36180", "Q177220", "Q639669", "Q1028181", "Q36834",
  "Q49757", "Q1930187", "Q39631", "Q901", "Q43845", "Q81096", "Q6625963", "Q2526255", "Q33231", "Q42973",
  "Q170790", "Q169470", "Q593644", "Q2066131", "Q11513337", "Q3665646", "Q10833314", "Q201788", "Q4964182",
  "Q1622272", "Q28389", "Q753110", "Q488205", "Q10871364", "Q19204627", "Q11774891", "Q12299841",
]);

const EXCLUDED_OCCUPATION_ROOTS = [
  "Q82955", "Q116", "Q1402561", "Q48352", "Q2285706",
  "Q2259532", "Q42603", "Q250867", "Q125482", "Q133485", "Q15995642", "Q1423891", "Q152002", "Q219477",
  "Q733786", "Q191808", "Q488111", "Q2159907", "Q12414919",
];
const EXCLUDED_OCCUPATION_PRUNE_ROOTS = [
  "Q155647", "Q15954519", "Q12797895", "Q22082749", "Q916292", "Q499134", "Q5178440", "Q15812002",
  "Q135268101", "Q18810149", "Q16185210", "Q8125919", "Q27044075", "Q125360586", "Q4594605", "Q16009129",
  "Q6731168", "Q335757",
];
const MILITARY_OCCUPATION_ROOTS = ["Q189290", "Q4991371"];
const EXCLUDED_POSITION_ROOTS = ["Q48352", "Q2285706", "Q116"];

const CHARACTER_BATCHES = [
  { id: "animation", target: 1000, universeCap: 40 },
  { id: "screen-books", target: 900, universeCap: 40 },
  { id: "myth-tales", target: 600, universeCap: Infinity },
];
const CHARACTER_HARVEST_ROOTS = ["Q95074", "Q3966183"];
const MYTH_STRONG_ROOTS = [
  "Q22989102", "Q11688446", "Q16513881", "Q146083", "Q22988604", "Q45713", "Q23015925", "Q113103481",
  "Q13002315", "Q12334344", "Q124710051", "Q25810847", "Q15839416", "Q6567237", "Q1483833", "Q89349965",
  "Q699", "Q1221280", "Q42402646", "Q24723", "Q588796",
];
const MYTH_EXACT_STRONG = ["Q4271324"];
const MYTH_WEAK_ROOTS = ["Q2239243", "Q4271324"];
const ANIMATION_CLASS_ROOTS = [
  "Q15711870", "Q1114461", "Q1569167", "Q80447738", "Q87576284", "Q112161269", "Q111847304", "Q33093124",
  "Q73502689", "Q111819966", "Q1094617", "Q3855553", "Q14831768", "Q6439708", "Q4412856", "Q20649759",
  "Q3959568", "Q112078124", "Q55740544", "Q3966183",
];
const WEAK_ANIMATION_CLASSES = ["Q15711870", "Q55740544"];
const LIVE_CLASS_ROOTS = ["Q3658341", "Q3375722"];
const STAGE_MUSIC_CLASS_ROOTS = ["Q63975020", "Q50386450"];
const LIVE_FRANCHISE_ROOTS = ["Q33125444", "Q20086260", "Q20086263", "Q15298259", "Q924827", "Q73502569", "Q15795874"];
const ANIMATION_WORK_ROOTS = [
  "Q202866", "Q581714", "Q117467246", "Q63952888", "Q1107", "Q8274", "Q21198342", "Q1004", "Q14406742",
  "Q838795", "Q725377", "Q213369", "Q7889", "Q627603",
];
const LIVE_WORK_ROOTS = ["Q11424", "Q5398426", "Q7725634", "Q47461344", "Q8261", "Q25379"];
const ADULT_ROOTS = ["Q291", "Q172067", "Q185529", "Q1046788"];
const RELIGIOUS_ROOTS = [
  "Q20643955", "Q12405827", "Q18563360", "Q18563354", "Q235113", "Q178342", "Q10822464", "Q581450", "Q6674",
  "Q979507", "Q65122124", "Q42857", "Q23847174", "Q19896979", "Q55607025", "Q4349921", "Q51626", "Q43115",
  "Q7055", "Q524158",
];
const DEITY_ROOTS = ["Q178885", "Q205985", "Q6058157"];
const ANCIENT_MYTH_ROOTS = [
  "Q22989102", "Q11688446", "Q16513881", "Q146083", "Q113103481", "Q45713", "Q23015925", "Q22988604", "Q588796",
];
const RELIGIOUS_EXEMPT_ROOTS = ["Q6567237"];
const BIG_CHARACTER_CLASSES = new Set([
  "Q15632617", "Q15773347", "Q15773317", "Q3658341", "Q15711870", "Q1114461", "Q1569167", "Q80447738",
  "Q87576284", "Q3966183", "Q699", "Q1221280",
]);
const MYTH_SEEDS = [
  "Q721568", "Q178638", "Q29576829", "Q29576866", "Q2048393", "Q2996714", "Q2629889", "Q2366098", "Q2481517",
  "Q388126", "Q723668", "Q21013704",
];
const CHARACTER_DETAIL_LIMIT = 6500;

const args = process.argv.slice(2);
const cacheFlag = args.indexOf("--cache");
const cacheDir = cacheFlag >= 0 ? path.resolve(args[cacheFlag + 1]) : null;
const positional = args.filter((arg, i) => !arg.startsWith("--") && (cacheFlag < 0 || i !== cacheFlag + 1));
const outDir = path.resolve(positional[0] ?? "/tmp/who-data");

const startedAt = Date.now();
const failures = [];
let queryCount = 0;
let cachedCount = 0;
let lastQueryEnd = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) => console.error(`[${Math.round((Date.now() - startedAt) / 1000)}s]`, ...parts);
const qidOf = (uri) => uri.slice(uri.lastIndexOf("/") + 1);
const isQid = (value) => /^Q\d+$/.test(value);
const values = (ids) => ids.map((id) => `wd:${id}`).join(" ");
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const bySitelinks = (a, b) => b.sl - a.sl || Number(a.qid.slice(1)) - Number(b.qid.slice(1));

class QueryError extends Error {
  constructor(message, retryable, retryAfter = 0) {
    super(message);
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }
}

async function runOnce(query) {
  const cacheFile = cacheDir && path.join(cacheDir, `${createHash("sha1").update(query).digest("hex")}.json`);
  if (cacheFile) {
    try {
      const cached = JSON.parse(await readFile(cacheFile, "utf8"));
      cachedCount += 1;
      return cached;
    } catch {
      // not cached yet
    }
  }
  const wait = lastQueryEnd + PAUSE_MS - Date.now();
  if (wait > 0) await sleep(wait);
  queryCount += 1;
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: HEADERS,
      body: new URLSearchParams({ query, format: "json" }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new QueryError(`HTTP ${response.status}: ${text.slice(0, 160).replace(/\s+/g, " ")}`, retryable, Number(response.headers.get("retry-after")) || 0);
    }
    let bindings;
    try {
      bindings = JSON.parse(text).results.bindings;
    } catch {
      throw new QueryError("invalid or truncated JSON body", true);
    }
    if (cacheFile) {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(cacheFile, JSON.stringify(bindings));
    }
    return bindings;
  } catch (error) {
    if (error instanceof QueryError) throw error;
    throw new QueryError(`${error.name}: ${error.message}`, true);
  } finally {
    lastQueryEnd = Date.now();
  }
}

async function sparql(query, label, tries = MAX_TRIES) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runOnce(query);
    } catch (error) {
      if (!error.retryable || attempt >= tries) throw error;
      const delay = error.retryAfter > 0 ? error.retryAfter * 1000 : 5000 * 3 ** (attempt - 1);
      log(`retry ${attempt}/${tries - 1} of ${label} in ${delay / 1000}s (${error.message})`);
      await sleep(delay);
    }
  }
}

async function runSplit(ids, label, build, multiTries = 1) {
  try {
    return await sparql(build(ids), label, ids.length > 1 ? multiTries : MAX_TRIES);
  } catch (error) {
    if (ids.length > 1) {
      log(`splitting ${label} (${ids.length} values) after: ${error.message}`);
      const middle = Math.ceil(ids.length / 2);
      const first = await runSplit(ids.slice(0, middle), `${label}a`, build, multiTries);
      const second = await runSplit(ids.slice(middle), `${label}b`, build, multiTries);
      return [...first, ...second];
    }
    failures.push({ query: label, values: ids, error: error.message });
    log(`FAILED ${label}: ${error.message}`);
    return [];
  }
}

async function single(query, label) {
  try {
    return await sparql(query, label);
  } catch (error) {
    failures.push({ query: label, error: error.message });
    log(`FAILED ${label}: ${error.message}`);
    return [];
  }
}

async function closureSet(roots, label) {
  const rows = await single(`SELECT DISTINCT ?c WHERE { VALUES ?r { ${values(roots)} } ?c wdt:P279* ?r . }`, `closure ${label}`);
  return new Set(rows.map((row) => qidOf(row.c.value)));
}

async function harvestByClass(property, classes, floor, label, bigClasses, smallChunkClasses = new Set()) {
  const big = classes.filter((c) => bigClasses.has(c));
  const small = classes.filter((c) => !bigClasses.has(c) && smallChunkClasses.has(c));
  const rest = classes.filter((c) => !bigClasses.has(c) && !smallChunkClasses.has(c));
  const chunks = [...big.map((c) => [c]), ...chunk(small, SMALL_CHUNK_SIZE), ...chunk(rest, CHUNK_SIZE)];
  const rows = [];
  for (const [i, ids] of chunks.entries()) {
    const found = await runSplit(
      ids,
      `${label} ${i + 1}/${chunks.length}`,
      (part) => `SELECT ?item ?sl ?cls WHERE { VALUES ?cls { ${values(part)} } ?item wdt:${property} ?cls . ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${floor}) }`,
    );
    for (const row of found) rows.push({ item: qidOf(row.item.value), sl: Number(row.sl.value), cls: qidOf(row.cls.value) });
  }
  log(`${label}: ${chunks.length} queries, ${rows.length} rows`);
  return rows;
}

function mergeRows(rows, into = new Map()) {
  for (const { item, sl, cls } of rows) {
    if (!isQid(item)) continue;
    const entry = into.get(item) ?? { qid: item, sl, classes: new Set() };
    entry.sl = Math.max(entry.sl, sl);
    if (cls && isQid(cls)) entry.classes.add(cls);
    into.set(item, entry);
  }
  return into;
}

const peopleCache = new Map();
const characterCache = new Map();
const workCache = new Map();

function emptyDetails() {
  return { p31: [], occ: [], cty: [], pos: [], born: [], died: [], work: [], universe: [], genre: [], sl: 0, trwiki: false };
}

async function fetchDetails(ids, properties, cache, label) {
  const missing = [...new Set(ids)].filter((id) => !cache.has(id));
  const chunks = chunk(missing, DETAILS_CHUNK);
  for (const [i, part] of chunks.entries()) {
    const rows = await runSplit(part, `${label} details ${i + 1}/${chunks.length}`, (subset) => {
      const branches = properties.map(([key, property]) => `{ ?item wdt:${property} ?v . BIND("${key}" AS ?k) }`);
      branches.push('{ ?item rdfs:label ?v . FILTER(LANG(?v) IN ("en", "tr", "mul")) BIND(CONCAT("label_", LANG(?v)) AS ?k) }');
      branches.push('{ ?item schema:description ?v . FILTER(LANG(?v) IN ("en", "tr")) BIND(CONCAT("desc_", LANG(?v)) AS ?k) }');
      branches.push('{ ?item wikibase:sitelinks ?v . BIND("sl" AS ?k) }');
      branches.push('{ ?article schema:about ?item ; schema:isPartOf <https://tr.wikipedia.org/> . BIND("trwiki" AS ?k) }');
      return `SELECT ?item ?k ?v WHERE { VALUES ?item { ${values(subset)} } ${branches.join(" UNION ")} }`;
    }, 2);
    const fetched = new Map(part.map((id) => [id, emptyDetails()]));
    for (const row of rows) {
      const details = fetched.get(qidOf(row.item.value));
      if (!details) continue;
      const key = row.k.value;
      const value = row.v ? (row.v.type === "uri" ? qidOf(row.v.value) : row.v.value) : null;
      if (key === "trwiki") details.trwiki = true;
      else if (key === "sl") details.sl = Number(value);
      else if (key.startsWith("label_") || key.startsWith("desc_")) details[key] = value;
      else if (key === "born" || key === "died") details[key].push(value);
      else if (value && isQid(value) && !details[key].includes(value)) details[key].push(value);
    }
    if (rows.length > 0) for (const [id, details] of fetched) cache.set(id, details);
  }
}

const labelCache = new Map();

async function fetchLabels(ids) {
  const missing = [...new Set(ids)].filter((id) => isQid(id) && !labelCache.has(id));
  const chunks = chunk(missing, LABELS_CHUNK);
  for (const [i, part] of chunks.entries()) {
    const rows = await runSplit(part, `labels ${i + 1}/${chunks.length}`, (subset) => `SELECT ?c ?l WHERE { VALUES ?c { ${values(subset)} } ?c rdfs:label ?l . FILTER(LANG(?l) IN ("en", "mul")) }`);
    const found = new Map();
    for (const row of rows) {
      const id = qidOf(row.c.value);
      const lang = row.l["xml:lang"];
      if (lang === "en" || !found.has(id)) found.set(id, row.l.value);
    }
    for (const id of part) labelCache.set(id, found.get(id) ?? null);
  }
}

const labelOf = (id) => labelCache.get(id) ?? id;

function yearOf(dates, pick) {
  const years = dates
    .map((date) => /^(-?\d+)-/.exec(date ?? ""))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  return years.length ? pick(...years) : null;
}

function baseRecord(qid, details) {
  return {
    qid,
    labelEn: details.label_en ?? details.label_mul ?? null,
    labelTr: details.label_tr ?? null,
    descEn: details.desc_en ?? null,
    descTr: details.desc_tr ?? null,
    sitelinks: details.sl,
    hasTrWiki: details.trwiki,
  };
}

async function buildPeopleGroups() {
  const groups = [];
  const rootGroup = new Map();
  for (const domain of PEOPLE_DOMAINS) {
    for (const group of domain.groups) {
      const index = groups.length;
      groups.push({ ...group, domain: domain.id, index, trBatch: group.trBatch ?? TR_BATCH_OF_DOMAIN[domain.id] });
      for (const root of group.roots) rootGroup.set(root, index);
    }
  }
  const prunes = new Map(PEOPLE_DOMAINS.map((domain) => [domain.id, new Set(domain.prune ?? [])]));
  const classGroup = new Map([...rootGroup].map(([root, group]) => [root, { group, depth: 0 }]));
  let frontier = [...rootGroup.keys()];
  for (let depth = 1; depth <= OCCUPATION_DEPTH && frontier.length; depth += 1) {
    const next = [];
    for (const [i, part] of chunk(frontier, 1500).entries()) {
      const rows = await runSplit(
        part,
        `occupation tree depth ${depth} ${i + 1}`,
        (ids) => `SELECT ?c ?p WHERE { VALUES ?p { ${values(ids)} } ?c wdt:P279 ?p . }`,
        2,
      );
      for (const row of rows) {
        const cls = qidOf(row.c.value);
        const parent = classGroup.get(qidOf(row.p.value));
        if (!isQid(cls) || !parent || prunes.get(groups[parent.group].domain).has(cls)) continue;
        const current = classGroup.get(cls);
        if (!current) {
          classGroup.set(cls, { group: parent.group, depth });
          next.push(cls);
        } else if (current.depth === depth && parent.group < current.group) {
          current.group = parent.group;
        }
      }
    }
    frontier = next;
  }
  return { groups, classGroup };
}

function groupOf(occupations, classGroup) {
  let shallow = Infinity;
  let deep = Infinity;
  for (const occupation of occupations) {
    const match = classGroup.get(occupation);
    if (!match) continue;
    if (match.depth <= 1) shallow = Math.min(shallow, match.group);
    else deep = Math.min(deep, match.group);
  }
  const best = shallow < Infinity ? shallow : deep;
  return best === Infinity ? null : best;
}

async function fillGroups(pools, quotas, accept, label) {
  const accepted = new Map([...pools.keys()].map((key) => [key, []]));
  const cursor = new Map([...pools.keys()].map((key) => [key, 0]));
  for (let round = 1; round <= 6; round += 1) {
    const slices = new Map();
    for (const [key, pool] of pools) {
      const need = quotas.get(key) - accepted.get(key).length;
      if (need <= 0 || cursor.get(key) >= pool.length) continue;
      const take = round === 1 ? Math.ceil(quotas.get(key) * FIRST_ROUND_MARGIN) : Math.ceil(need * 1.5) + 3;
      slices.set(key, pool.slice(cursor.get(key), cursor.get(key) + take));
      cursor.set(key, cursor.get(key) + take);
    }
    if (slices.size === 0) break;
    const ids = [...slices.values()].flat().map((candidate) => candidate.qid);
    log(`${label} round ${round}: checking ${ids.length} candidates`);
    await fetchDetails(ids, PEOPLE_PROPERTIES, peopleCache, `${label} r${round}`);
    for (const [key, slice] of slices) {
      for (const candidate of slice) {
        if (accepted.get(key).length >= quotas.get(key)) break;
        const details = peopleCache.get(candidate.qid);
        if (details && accept(candidate, details)) accepted.get(key).push(candidate.qid);
      }
    }
  }
  return accepted;
}

async function fillWithSpill(groups, pools, quotas, batchOf, accept, label) {
  const accepted = await fillGroups(pools, quotas, accept, label);
  const shortfall = new Map();
  for (const group of groups) {
    const missing = quotas.get(group.index) - accepted.get(group.index).length;
    if (missing > 0) shortfall.set(batchOf(group), (shortfall.get(batchOf(group)) ?? 0) + missing);
  }
  if (shortfall.size === 0) return accepted;
  for (const [batch, missing] of shortfall) {
    const donors = groups.filter((g) => batchOf(g) === batch
      && quotas.get(g.index) > 0
      && accepted.get(g.index).length >= quotas.get(g.index)
      && pools.get(g.index).length > quotas.get(g.index));
    const total = donors.reduce((sum, g) => sum + quotas.get(g.index), 0);
    for (const g of donors) quotas.set(g.index, quotas.get(g.index) + Math.ceil((missing * quotas.get(g.index)) / total));
  }
  return fillGroups(pools, quotas, accept, `${label} spill`);
}

const PEOPLE_PROPERTIES = [
  ["p31", "P31"],
  ["occ", "P106"],
  ["cty", "P27"],
  ["pos", "P39"],
  ["born", "P569"],
  ["died", "P570"],
];

async function collectPeople(meta) {
  const { groups, classGroup } = await buildPeopleGroups();
  const excludedOccupations = await closureSet(EXCLUDED_OCCUPATION_ROOTS, "excluded occupations");
  const militaryOccupations = await closureSet(MILITARY_OCCUPATION_ROOTS, "military occupations");
  for (const cls of await closureSet(EXCLUDED_OCCUPATION_PRUNE_ROOTS, "excluded occupation prunes")) {
    excludedOccupations.delete(cls);
    militaryOccupations.delete(cls);
  }
  for (const cls of excludedOccupations) militaryOccupations.delete(cls);
  const militaryOnly = (occupations) => {
    const military = occupations.filter((o) => militaryOccupations.has(o));
    const civilian = occupations.some((o) => classGroup.has(o) && !militaryOccupations.has(o));
    return military.length && !civilian ? military : [];
  };
  const excludedPositions = await closureSet(EXCLUDED_POSITION_ROOTS, "excluded positions");
  log(`occupation classes: ${classGroup.size}, excluded occupation classes: ${excludedOccupations.size}, excluded positions: ${excludedPositions.size}`);

  const excluded = new Map();
  const rejectReason = (details) => {
    if (!details.p31.includes("Q5")) return "not human";
    const badOccupations = details.occ.filter((o) => excludedOccupations.has(o));
    if (badOccupations.length) return { occupations: badOccupations };
    const soldierOnly = militaryOnly(details.occ);
    if (soldierOnly.length) return { occupations: soldierOnly };
    const badPositions = details.pos.filter((p) => excludedPositions.has(p));
    if (badPositions.length) return { positions: badPositions };
    const born = yearOf(details.born, Math.min);
    if (born !== null && born > MAX_BIRTH_YEAR) return `born ${born}`;
    return null;
  };
  const accept = (requireTurkish) => (candidate, details) => {
    const turkish = details.cty.some((c) => TURKEY.includes(c));
    if (requireTurkish ? !turkish || !details.trwiki : turkish) return false;
    const reason = rejectReason(details);
    if (reason) {
      if (reason !== "not human") {
        excluded.set(candidate.qid, { qid: candidate.qid, sl: details.sl, group: groups[candidate.group].id, region: requireTurkish ? "tr" : "world", reason });
      }
      return false;
    }
    return true;
  };

  const shallowClasses = new Set([...classGroup].filter(([, match]) => match.depth <= 1).map(([cls]) => cls));
  const worldRows = await harvestByClass("P106", [...classGroup.keys()], FLOORS.world, "world people", BIG_OCCUPATIONS, shallowClasses);
  const world = mergeRows(worldRows);
  const worldPools = new Map(groups.map((g) => [g.index, []]));
  for (const entry of world.values()) {
    entry.group = groupOf(entry.classes, classGroup);
    if (entry.group !== null) worldPools.get(entry.group).push(entry);
  }
  for (const pool of worldPools.values()) pool.sort(bySitelinks);

  const trRows = [];
  for (const country of TURKEY) {
    const rows = await single(
      `SELECT ?item ?sl ?cls WHERE { ?item wdt:P27 wd:${country} . ?item wikibase:sitelinks ?sl . FILTER(?sl >= ${FLOORS.tr}) ?article schema:about ?item ; schema:isPartOf <https://tr.wikipedia.org/> . OPTIONAL { ?item wdt:P106 ?cls } }`,
      `tr people ${country}`,
    );
    for (const row of rows) trRows.push({ item: qidOf(row.item.value), sl: Number(row.sl.value), cls: row.cls ? qidOf(row.cls.value) : null });
  }
  const tr = mergeRows(trRows);
  log(`tr people harvest: ${tr.size} people`);
  const trPools = new Map(groups.map((g) => [g.index, []]));
  for (const entry of tr.values()) {
    const occupations = [...entry.classes];
    const badOccupations = occupations.filter((c) => excludedOccupations.has(c));
    if (!badOccupations.length) badOccupations.push(...militaryOnly(occupations));
    if (badOccupations.length) {
      const group = groupOf(entry.classes, classGroup);
      if (group !== null) excluded.set(entry.qid, { qid: entry.qid, sl: entry.sl, group: groups[group].id, region: "tr", reason: { occupations: badOccupations } });
      continue;
    }
    entry.group = groupOf(entry.classes, classGroup);
    if (entry.group !== null) trPools.get(entry.group).push(entry);
  }
  for (const pool of trPools.values()) pool.sort(bySitelinks);

  const worldQuotas = new Map(groups.map((g) => [g.index, g.world]));
  const trQuotas = new Map(groups.map((g) => [g.index, g.tr]));
  const worldAccepted = await fillWithSpill(groups, worldPools, worldQuotas, (g) => `world-${g.domain}`, accept(false), "world people");
  const trAccepted = await fillWithSpill(groups, trPools, trQuotas, (g) => g.trBatch, accept(true), "tr people");

  const batches = new Map();
  const add = (batch, group, ids) => {
    if (!batches.has(batch)) batches.set(batch, []);
    for (const qid of ids) batches.get(batch).push({ qid, group });
  };
  for (const group of groups) {
    add(`world-${group.domain}`, group, worldAccepted.get(group.index));
    add(group.trBatch, group, trAccepted.get(group.index));
  }
  meta.peopleGroups = groups.map((g) => ({
    id: g.id,
    domain: g.domain,
    worldQuota: worldQuotas.get(g.index),
    worldAccepted: worldAccepted.get(g.index).length,
    worldPool: worldPools.get(g.index).length,
    trQuota: trQuotas.get(g.index),
    trAccepted: trAccepted.get(g.index).length,
    trPool: trPools.get(g.index).length,
  }));
  return { batches, classGroup, groups, excluded: [...excluded.values()] };
}

function characterBatchOf(classes, mainWork, sets) {
  if (classes.some((c) => sets.mythStrong.has(c))) return "myth-tales";
  if (classes.some((c) => sets.liveFranchises.has(c))) return "screen-books";
  const animation = classes.filter((c) => sets.animationClasses.has(c) && !WEAK_ANIMATION_CLASSES.includes(c)).length;
  const live = classes.filter((c) => sets.liveClasses.has(c)).length;
  if (animation !== live) return animation > live ? "animation" : "screen-books";
  if (mainWork?.p31.some((c) => sets.animationWorks.has(c))) return "animation";
  if (mainWork?.p31.some((c) => sets.liveWorks.has(c))) return "screen-books";
  if (classes.some((c) => sets.mythWeak.has(c))) return "myth-tales";
  if (classes.some((c) => sets.animationClasses.has(c))) return "animation";
  return mainWork ? "screen-books" : null;
}

const CHARACTER_PROPERTIES = [
  ["p31", "P31"],
  ["cty", "P27"],
  ["born", "P569"],
  ["died", "P570"],
  ["work", "P1441"],
  ["universe", "P1080"],
  ["genre", "P136"],
];
const WORK_PROPERTIES = [
  ["p31", "P31"],
  ["genre", "P136"],
];

async function collectCharacters(meta) {
  const characterClasses = await closureSet(CHARACTER_HARVEST_ROOTS, "character classes");
  const mythStrong = await closureSet(MYTH_STRONG_ROOTS, "myth strong");
  for (const id of MYTH_EXACT_STRONG) mythStrong.add(id);
  const mythWeak = await closureSet(MYTH_WEAK_ROOTS, "myth weak");
  for (const id of mythStrong) mythWeak.delete(id);
  const sets = {
    mythStrong,
    mythWeak,
    animationClasses: await closureSet(ANIMATION_CLASS_ROOTS, "animation classes"),
    liveClasses: await closureSet(LIVE_CLASS_ROOTS, "live classes"),
    liveFranchises: await closureSet(LIVE_FRANCHISE_ROOTS, "live franchises"),
    animationWorks: await closureSet(ANIMATION_WORK_ROOTS, "animation works"),
    liveWorks: await closureSet(LIVE_WORK_ROOTS, "live works"),
    adult: await closureSet(ADULT_ROOTS, "adult"),
    religious: await closureSet(RELIGIOUS_ROOTS, "religious"),
    deities: await closureSet(DEITY_ROOTS, "deities"),
    ancientMyth: await closureSet(ANCIENT_MYTH_ROOTS, "ancient mythology"),
    religiousExempt: await closureSet(RELIGIOUS_EXEMPT_ROOTS, "religious exempt"),
  };
  const mythClasses = [...new Set([...mythStrong, ...mythWeak])];
  const otherClasses = [...characterClasses].filter((c) => !mythStrong.has(c) && !mythWeak.has(c));
  log(`character classes: ${characterClasses.size}, myth strong: ${mythStrong.size}, myth weak: ${mythWeak.size}`);

  const candidates = mergeRows(await harvestByClass("P31", mythClasses, FLOORS.myth, "myth characters", BIG_CHARACTER_CLASSES));
  mergeRows(await harvestByClass("P31", otherClasses, FLOORS.characters, "fictional characters", BIG_CHARACTER_CLASSES), candidates);

  const turkishLinked = new Set(MYTH_SEEDS);
  const turkishQueries = [
    [
      "tr characters in Turkish works",
      `SELECT DISTINCT ?item ?sl WHERE { VALUES ?c { ${values(TURKEY)} } ?work wdt:P495 ?c . ?item wdt:P1441 ?work . ?article schema:about ?item ; schema:isPartOf <https://tr.wikipedia.org/> . ?item wikibase:sitelinks ?sl . }`,
    ],
    [
      "tr Turkic mythology",
      `SELECT DISTINCT ?item ?sl WHERE { VALUES ?p { wdt:P31 wdt:P361 wdt:P1080 } ?item ?p wd:Q588796 . ?article schema:about ?item ; schema:isPartOf <https://tr.wikipedia.org/> . ?item wikibase:sitelinks ?sl . }`,
    ],
  ];
  for (const [label, query] of turkishQueries) {
    for (const row of await single(query, label)) turkishLinked.add(qidOf(row.item.value));
  }
  log(`character harvest: ${candidates.size} candidates, ${turkishLinked.size} Turkish-linked`);

  for (const cls of [...sets.animationClasses, ...(await closureSet(STAGE_MUSIC_CLASS_ROOTS, "stage music classes"))]) {
    sets.liveClasses.delete(cls);
  }
  const preBatch = (entry) => characterBatchOf([...entry.classes], null, sets);
  const ranked = [...candidates.values()].sort(bySitelinks);
  const perBatchLimit = new Map(CHARACTER_BATCHES.map((b) => [b.id, Math.ceil(b.target * 2)]));
  const unknownLimit = CHARACTER_DETAIL_LIMIT - [...perBatchLimit.values()].reduce((a, b) => a + b, 0);
  const counts = new Map();
  const detailIds = new Set([...turkishLinked]);
  for (const entry of ranked) {
    const batch = preBatch(entry) ?? "unknown";
    const limit = batch === "unknown" ? unknownLimit : perBatchLimit.get(batch);
    const seen = counts.get(batch) ?? 0;
    if (seen >= limit) continue;
    counts.set(batch, seen + 1);
    detailIds.add(entry.qid);
  }
  log(`character details for ${detailIds.size} items`, Object.fromEntries(counts));
  await fetchDetails([...detailIds], CHARACTER_PROPERTIES, characterCache, "characters");

  const workIds = new Set();
  for (const id of detailIds) {
    const details = characterCache.get(id);
    if (!details) continue;
    for (const w of [...details.work, ...details.universe]) workIds.add(w);
  }
  await fetchDetails([...workIds], WORK_PROPERTIES, workCache, "works");

  const allCharacterClasses = new Set([...characterClasses, ...mythClasses]);
  const assigned = new Map(CHARACTER_BATCHES.map((b) => [b.id, []]));
  let adultDropped = 0;
  let religiousDropped = 0;
  for (const id of detailIds) {
    const details = characterCache.get(id);
    if (!details) continue;
    const seed = MYTH_SEEDS.includes(id);
    if (!seed && !details.p31.some((c) => allCharacterClasses.has(c))) continue;
    if (!seed && details.p31.includes("Q5") && !details.p31.some((c) => mythStrong.has(c))) continue;
    const works = details.work.map((w) => workCache.get(w) ?? emptyDetails());
    const adult = [...details.genre, ...details.p31].some((c) => sets.adult.has(c))
      || works.some((w) => [...w.genre, ...w.p31].some((c) => sets.adult.has(c)));
    if (adult) {
      adultDropped += 1;
      continue;
    }
    const has = (set) => details.p31.some((c) => set.has(c));
    const religious = has(sets.religious) || (has(sets.deities) && !has(sets.ancientMyth));
    if (!seed && religious && !has(sets.religiousExempt)) {
      religiousDropped += 1;
      continue;
    }
    const byWorkSitelinks = (list) => [...list].sort((a, b) => (workCache.get(b)?.sl ?? 0) - (workCache.get(a)?.sl ?? 0));
    const mainWork = byWorkSitelinks(details.work)[0] ?? null;
    const universe = byWorkSitelinks(details.universe)[0] ?? null;
    const batch = seed ? "myth-tales" : characterBatchOf(details.p31, mainWork ? workCache.get(mainWork) ?? null : null, sets) ?? "screen-books";
    assigned.get(batch).push({ qid: id, sl: details.sl, mainWork, universe, turkish: turkishLinked.has(id) });
  }

  const batches = new Map();
  for (const { id, target, universeCap } of CHARACTER_BATCHES) {
    const perUniverse = new Map();
    const chosen = [];
    for (const entry of assigned.get(id).sort(bySitelinks)) {
      const key = entry.universe ?? entry.mainWork;
      const used = key ? perUniverse.get(key) ?? 0 : 0;
      const fits = chosen.length < target && used < universeCap;
      if (!fits && !entry.turkish) continue;
      if (key) perUniverse.set(key, used + 1);
      chosen.push(entry);
    }
    batches.set(id, chosen);
  }
  meta.characters = {
    harvested: candidates.size,
    detailed: detailIds.size,
    adultDropped,
    religiousDropped,
    assigned: Object.fromEntries([...assigned].map(([id, list]) => [id, list.length])),
  };
  return batches;
}

function peopleRecord(qid, group, classGroup, groups) {
  const details = peopleCache.get(qid);
  const inDomain = (o) => {
    const match = classGroup.get(o);
    return match !== undefined && groups[match.group].domain === group.domain;
  };
  const occupations = [...details.occ.filter(inDomain), ...details.occ.filter((o) => !inDomain(o))];
  return {
    ...baseRecord(qid, details),
    occupations: occupations.map(labelOf),
    countries: details.cty.map(labelOf),
    birthYear: yearOf(details.born, Math.min),
    deathYear: yearOf(details.died, Math.min),
  };
}

function characterRecord(entry) {
  const details = characterCache.get(entry.qid);
  return {
    ...baseRecord(entry.qid, details),
    classes: details.p31.map(labelOf),
    fromWork: entry.mainWork ? labelOf(entry.mainWork) : null,
    universe: entry.universe ? labelOf(entry.universe) : null,
    countries: details.cty.map(labelOf),
    birthYear: yearOf(details.born, Math.min),
    deathYear: yearOf(details.died, Math.min),
  };
}

function summarize(name, records) {
  const sitelinks = records.map((r) => r.sitelinks);
  const withTr = records.filter((r) => r.labelTr).length;
  return {
    file: `${name}.json`,
    count: records.length,
    minSitelinks: sitelinks.length ? Math.min(...sitelinks) : null,
    maxSitelinks: sitelinks.length ? Math.max(...sitelinks) : null,
    turkishLabelShare: records.length ? Number((withTr / records.length).toFixed(3)) : null,
  };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  log(`writing to ${outDir}${cacheDir ? `, cache ${cacheDir}` : ""}`);
  const meta = { startedAt: new Date(startedAt).toISOString(), floors: FLOORS };

  const characters = await collectCharacters(meta);
  const characterIds = new Set([...characters.values()].flat().map((entry) => entry.qid));
  const people = await collectPeople(meta);

  const labelIds = new Set();
  for (const list of people.batches.values()) {
    for (const { qid } of list) {
      const details = peopleCache.get(qid);
      for (const id of [...details.occ, ...details.cty]) labelIds.add(id);
    }
  }
  for (const list of characters.values()) {
    for (const entry of list) {
      const details = characterCache.get(entry.qid);
      for (const id of [...details.p31, ...details.cty, entry.mainWork, entry.universe]) if (id) labelIds.add(id);
    }
  }
  const excludedSorted = people.excluded.sort(bySitelinks);
  const excludedTop = [
    ...excludedSorted.filter((entry) => entry.region === "world").slice(0, 400),
    ...excludedSorted.filter((entry) => entry.region === "tr").slice(0, 200),
  ];
  for (const entry of excludedTop) {
    if (!peopleCache.has(entry.qid)) labelIds.add(entry.qid);
    for (const id of [...(entry.reason.occupations ?? []), ...(entry.reason.positions ?? [])]) labelIds.add(id);
  }
  await fetchLabels([...labelIds]);

  const summaries = [];
  const order = ["world-music", "world-screen", "world-sports", "world-science", "world-arts", "world-history", "tr-music", "tr-screen", "tr-sports", "tr-other"];
  let movedToCharacters = 0;
  for (const name of order) {
    const records = [];
    for (const { qid, group } of people.batches.get(name) ?? []) {
      if (characterIds.has(qid)) {
        movedToCharacters += 1;
        continue;
      }
      records.push(peopleRecord(qid, group, people.classGroup, people.groups));
    }
    records.sort((a, b) => b.sitelinks - a.sitelinks);
    await writeFile(path.join(outDir, `${name}.json`), `${JSON.stringify(records, null, 1)}\n`);
    summaries.push(summarize(name, records));
  }
  for (const { id } of CHARACTER_BATCHES) {
    const records = characters.get(id).map(characterRecord).sort((a, b) => b.sitelinks - a.sitelinks);
    await writeFile(path.join(outDir, `${id}.json`), `${JSON.stringify(records, null, 1)}\n`);
    summaries.push(summarize(id, records));
  }

  const excludedRecords = excludedTop.map((entry) => {
    const details = peopleCache.get(entry.qid);
    const reason = typeof entry.reason === "string"
      ? entry.reason
      : [...(entry.reason.occupations ?? []), ...(entry.reason.positions ?? [])].map(labelOf).join(", ");
    const label = details ? details.label_en ?? details.label_mul ?? null : labelCache.get(entry.qid) ?? null;
    return { qid: entry.qid, label, sitelinks: entry.sl, region: entry.region, group: entry.group, reason };
  });
  await writeFile(path.join(outDir, "_excluded-people.json"), `${JSON.stringify(excludedRecords, null, 1)}\n`);

  Object.assign(meta, {
    durationSeconds: Math.round((Date.now() - startedAt) / 1000),
    queries: queryCount,
    cachedQueries: cachedCount,
    movedToCharacters,
    failures,
    files: summaries,
  });
  await writeFile(path.join(outDir, "_run.json"), `${JSON.stringify(meta, null, 1)}\n`);
  for (const summary of summaries) log(JSON.stringify(summary));
  log(`done: ${queryCount} queries (${cachedCount} cached), ${failures.length} failed, ${meta.durationSeconds}s`);
}

// Importing the file (from a test, say) must never start a network run.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
