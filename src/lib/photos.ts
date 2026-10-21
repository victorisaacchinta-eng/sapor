import "server-only";

/**
 * Real food photos for each order, from Unsplash (or Pexels when a Pexels key
 * is set). Both licences allow free commercial use with no watermark.
 *
 * Stock search is loose, so every candidate is checked against the photo's own
 * description: the dish's anchor ("bao", "pav bhaji") should appear in it,
 * premium (Unsplash+) photos are skipped, and photos that are mainly about
 * people are pushed down.
 *
 * Keys never leave the server. Results are cached here and at the edge, so a
 * dish is looked up once and shared by every visitor.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const UNSPLASH = () => process.env.UNSPLASH_ACCESS_KEY;
const PEXELS = () => process.env.PEXELS_API_KEY;
const APP = "sapor";

export type DishPhoto = {
  src: string; // square crop, 600px
  srcWide: string; // 1200px wide crop for large tiles
  alt: string;
  avgColor?: string;
  photographer: string;
  photographerUrl: string;
  photoUrl: string;
  source: "Unsplash" | "Pexels";
  /** exact: shows this dish; similar: shows the same kind of dish */
  match: "exact" | "similar";
  anchor: string;
};

/** One search hit, normalised across providers. */
type Hit = {
  id: string;
  text: string; // alt + description, used for relevance
  color?: string;
  photographer: string;
  photographerUrl: string;
  photoUrl: string;
  square: string;
  wide: string;
  downloadLocation?: string;
  source: "Unsplash" | "Pexels";
};

/* ------------------------------------------------------------------ */
/* Dish vocabulary                                                     */
/* ------------------------------------------------------------------ */

/** Named dishes are checked first, so "pav bhaji bruschetta" is shown as pav bhaji. */
const NAMED = [
  "pav bhaji", "vada pav", "masala dosa", "butter chicken", "paneer tikka", "chole bhature", "gulab jamun", "pani puri",
  "filter coffee", "masala chai", "cold brew", "ice cream", "fish and chips", "mac and cheese", "creme brulee",
  "tres leches", "bubble tea", "hot chocolate", "french fries", "fried rice", "pad thai", "dim sum", "spring rolls",
  "tom yum", "banh mi", "eggs benedict", "french toast", "avocado toast", "chicken wings", "onion rings",
  "soft serve", "iced coffee", "iced latte", "chai latte", "matcha latte", "fish fry",
];

const NOUNS = [
  "biryani", "mandi", "haleem", "dosa", "idli", "vada", "uttapam", "samosa", "kebab", "tikka", "curry", "dal", "naan",
  "paratha", "momo", "momos", "dumpling", "dumplings", "gyoza", "bao", "ramen", "udon", "pho", "noodles", "japchae",
  "sushi", "kimbap", "bibimbap", "tteokbokki", "pizza", "pasta", "lasagna", "ravioli", "risotto", "gnocchi", "spaghetti",
  "penne", "focaccia", "bruschetta", "burger", "sandwich", "panini", "wrap", "shawarma", "falafel", "hummus", "taco",
  "tacos", "burrito", "nachos", "quesadilla", "salad", "bowl", "soup", "steak", "sizzler", "croissant", "quiche", "tart",
  "waffle", "waffles", "pancake", "pancakes", "crepe", "cake", "cheesecake", "brownie", "tiramisu", "kunafa", "baklava",
  "gelato", "sundae", "cookie", "cookies", "donut", "doughnut", "macaron", "mousse", "pudding", "kulfi", "falooda",
  "cappuccino", "latte", "espresso", "americano", "mocha", "coffee", "chai", "tea", "lassi", "shake", "milkshake",
  "smoothie", "mojito", "lemonade", "juice", "fries", "popcorn", "toast", "bagel", "muffin", "pastry", "bread",
];

const FILLER = new Set([
  "special", "loaded", "classic", "signature", "house", "our", "too", "much", "fresh", "homemade", "the", "with", "and",
  "of", "style", "mini", "jumbo", "large", "small", "regular", "combo", "a", "an", "in", "on", "de", "la", "al", "di",
  "speciality", "famous", "best", "new", "original", "chef", "chefs", "fantasy", "lovely", "holla",
]);

/** Other ways stock photographers describe the same dish. */
const ALIASES: Record<string, string[]> = {
  "masala chai": ["chai", "masala tea", "indian tea", "milk tea"],
  chai: ["masala chai", "masala tea", "indian tea", "milk tea"],
  bao: ["gua bao", "steamed bun", "bao bun"],
  momo: ["momos", "dumpling", "dumplings"],
  "pav bhaji": ["pav bhaji", "bhaji pav"],
  "filter coffee": ["south indian coffee", "filter kaapi", "kaapi"],
  biryani: ["biriyani", "biryani rice"],
  "cold brew": ["iced coffee", "cold coffee"],
  gelato: ["ice cream"],
  "ice cream": ["gelato"],
};

const MEAT = /\b(meat|chicken|pork|beef|mutton|lamb|fish|prawn|prawns|shrimp|bacon|ham|sausage|egg|eggs|steak|duck|turkey|salmon|tuna)\b/i;

const PEOPLE = /\b(woman|man|men|women|person|people|girl|boy|couple|chef|friends|family|hand|hands|holding|eating|smiling|portrait)\b/i;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const has = (text: string, word: string) => {
  const t = ` ${text} `;
  return t.includes(` ${word} `) || t.includes(` ${word}s `) || t.includes(` ${word}es `) || (word.endsWith("s") && t.includes(` ${word.slice(0, -1)} `));
};

export function analyseDish(dish: string) {
  const n = norm(dish);
  const anchor = NAMED.find((w) => has(n, w)) ?? [...n.split(" ")].reverse().find((w) => NOUNS.includes(w)) ?? null;
  const tokens = n.split(" ").filter((w) => w.length > 1 && !FILLER.has(w));
  const anchorWords = anchor ? anchor.split(" ") : [];
  const modifiers = tokens.filter((w) => !anchorWords.includes(w));
  return { n, anchor, tokens, modifiers };
}

/* ------------------------------------------------------------------ */
/* Pexels                                                              */
/* ------------------------------------------------------------------ */

const TTL = 1000 * 60 * 60 * 24;
const cache = new Map<string, { at: number; v: DishPhoto | null }>();
const searchCache = new Map<string, { at: number; v: Hit[] }>();

/*
 * The free Unsplash tier allows 50 searches an hour, so lookups are also kept
 * on disk (the instance's temp folder). That survives dev reloads and warm
 * serverless restarts; the CDN cache in the route handles everything else.
 */
const DISK = join(tmpdir(), "sapor-photo-cache.json");
try {
  const raw = JSON.parse(readFileSync(DISK, "utf8")) as { cache?: [string, { at: number; v: DishPhoto | null }][]; search?: [string, { at: number; v: Hit[] }][] };
  for (const [k, v] of raw.cache ?? []) if (Date.now() - v.at < TTL) cache.set(k, v);
  for (const [k, v] of raw.search ?? []) if (Date.now() - v.at < TTL) searchCache.set(k, v);
} catch {
  /* no cache yet */
}
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(tmpdir(), { recursive: true });
      writeFileSync(DISK, JSON.stringify({ cache: [...cache.entries()].slice(-500), search: [...searchCache.entries()].slice(-300) }));
    } catch {
      /* read-only file system: memory cache only */
    }
  }, 500);
}
let lowQuota = false;

const utm = `utm_source=${APP}&utm_medium=referral`;
const withUtm = (u: string) => `${u}${u.includes("?") ? "&" : "?"}${utm}`;

async function getJSON(url: string, headers: Record<string, string>) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    clearTimeout(timer);
    const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? "999");
    if (remaining < 5) {
      // keep a small reserve; resume after the hour turns over
      lowQuota = true;
      setTimeout(() => (lowQuota = false), 1000 * 60 * 20);
    }
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

type UnsplashPhoto = {
  id: string;
  alt_description?: string | null;
  description?: string | null;
  color?: string;
  premium?: boolean;
  plus?: boolean;
  urls: { raw: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
};

type PexelsPhoto = {
  id: number;
  url: string;
  alt: string;
  avg_color?: string;
  photographer: string;
  photographer_url: string;
  src: { original: string };
};

const sized = (raw: string, w: number, h: number) => {
  const base = raw.split("?")[0];
  return raw.includes("images.unsplash.com")
    ? `${raw}${raw.includes("?") ? "&" : "?"}w=${w}&h=${h}&fit=crop&crop=entropy&auto=format&q=75`
    : `${base}?auto=compress&cs=tinysrgb&fit=crop&w=${w}&h=${h}`;
};

async function search(query: string): Promise<Hit[]> {
  const hit = searchCache.get(query);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  if (lowQuota) return [];
  let out: Hit[] = [];
  if (UNSPLASH()) {
    const url = `https://api.unsplash.com/search/photos?${new URLSearchParams({ query, per_page: "30", content_filter: "high" })}`;
    const body = (await getJSON(url, { Authorization: `Client-ID ${UNSPLASH()}`, "Accept-Version": "v1" })) as { results?: UnsplashPhoto[] } | null;
    out = (body?.results ?? [])
      .filter((p) => !p.premium && !p.plus && !p.urls.raw.includes("plus.unsplash.com"))
      .map((p) => ({
        id: p.id,
        text: `${p.alt_description ?? ""} ${p.description ?? ""}`,
        color: p.color,
        photographer: p.user.name,
        photographerUrl: withUtm(p.user.links.html),
        photoUrl: withUtm(p.links.html),
        square: sized(p.urls.raw, 600, 600),
        wide: sized(p.urls.raw, 1200, 800),
        downloadLocation: p.links.download_location,
        source: "Unsplash" as const,
      }));
  } else if (PEXELS()) {
    const url = `https://api.pexels.com/v1/search?${new URLSearchParams({ query, per_page: "30", locale: "en-US" })}`;
    const body = (await getJSON(url, { Authorization: PEXELS() ?? "" })) as { photos?: PexelsPhoto[] } | null;
    out = (body?.photos ?? []).map((p) => ({
      id: String(p.id),
      text: p.alt ?? "",
      color: p.avg_color,
      photographer: p.photographer,
      photographerUrl: p.photographer_url,
      photoUrl: p.url,
      square: sized(p.src.original, 600, 600),
      wide: sized(p.src.original, 1200, 800),
      source: "Pexels" as const,
    }));
  }
  searchCache.set(query, { at: Date.now(), v: out });
  persist();
  if (searchCache.size > 600) searchCache.delete(searchCache.keys().next().value as string);
  return out;
}

const FOOD = /\b(food|dish|plate|bowl|meal|bread|bun|curry|snack|dessert|cake|cup|coffee|tea|drink|sauce|served|delicious|cuisine|restaurant|breakfast|lunch|dinner|fried|baked|grilled)\b/i;

/**
 * strong: the photo's own description names the dish.
 * weak: it doesn't, but it is the top food photo for a query that names the
 * dish (stock descriptions are often generic: "a plate of food with bread").
 */
function score(p: Hit, anchor: string | null, modifiers: string[], tokens: string[], queryHasAnchor: boolean, veg: boolean) {
  const text = norm(p.text);
  // a vegetarian dish is never shown with a photo that describes meat
  if (veg && MEAT.test(text)) return { s: -1, strong: false };
  const penalty = PEOPLE.test(text) ? 4 : 0;
  const modHits = modifiers.filter((w) => has(text, w)).length;
  if (anchor && anchor.split(" ").every((w) => has(text, w))) return { s: 20 + modHits * 3 - penalty, strong: true };
  if (anchor && (ALIASES[anchor] ?? []).some((a) => a.split(" ").every((w) => has(text, w)))) return { s: 16 + modHits * 3 - penalty, strong: true };
  if (!anchor) {
    const hits = tokens.filter((w) => has(text, w)).length;
    if (tokens.length && hits >= Math.ceil(tokens.length / 2)) return { s: 20 + hits * 2 - penalty, strong: true };
  }
  // weak: description is generic but still names part of the dish, from a query that names it
  const anchorPart = anchor ? anchor.split(" ").some((w) => w.length > 3 && has(text, w)) : false;
  if (queryHasAnchor && anchorPart && FOOD.test(text) && !PEOPLE.test(text)) return { s: 6 + modHits * 2 - penalty, strong: false };
  return { s: -1, strong: false };
}

const tracked = new Set<string>();
function trackUse(h: Hit) {
  // Unsplash asks apps to register a use when a photo is placed in front of people.
  if (h.source !== "Unsplash" || !h.downloadLocation || tracked.has(h.id) || !UNSPLASH()) return;
  tracked.add(h.id);
  void getJSON(h.downloadLocation, { Authorization: `Client-ID ${UNSPLASH()}`, "Accept-Version": "v1" });
}

export function photosEnabled() {
  return Boolean(UNSPLASH() || PEXELS());
}

const HERO_VEG = ["paneer", "tofu", "halloumi", "mushroom", "jackfruit", "falafel", "chickpea", "aloo", "potato"];

const NONVEG_DISH = /\b(chicken|mutton|lamb|fish|prawn|prawns|shrimp|beef|pork|bacon|ham|egg|eggs|keema|turkey|duck|salmon|tuna|meat)\b/i;

export async function findDishPhoto(dish: string): Promise<DishPhoto | null> {
  if (!photosEnabled()) return null;
  const { n, anchor, tokens, modifiers } = analyseDish(dish);
  if (!n) return null;
  // paneer, veg and anything without a meat word should not be shown with meat
  const veg = !NONVEG_DISH.test(n);
  // the veg ingredient a dish is built around, used when no photo of the exact dish passes
  const hero = veg ? HERO_VEG.find((w) => has(n, w)) : undefined;
  const cached = cache.get(n);
  if (cached && Date.now() - cached.at < TTL && (cached.v || !hero)) return cached.v;

  const queries: string[] = [];
  const push = (q: string) => {
    const t = q.trim();
    if (t && !queries.includes(t)) queries.push(t);
  };
  push(tokens.join(" "));
  if (anchor) {
    if (modifiers.length) push(`${modifiers[0]} ${anchor}`);
    push(anchor === "bao" ? "bao bun" : anchor === "masala chai" || anchor === "chai" ? "masala chai tea" : anchor);
  }

  let best: { h: Hit; s: number; strong: boolean } | null = null;
  for (const q of queries.slice(0, 3)) {
    const hits = await search(q);
    const queryHasAnchor = Boolean(anchor && anchor.split(" ").every((w) => has(norm(q), w)));
    for (const h of hits.slice(0, 20)) {
      const r = score(h, anchor, modifiers, tokens, queryHasAnchor, veg);
      if (r.s < 0) continue;
      if (!best || r.s > best.s) best = { h, ...r };
    }
    if (best?.strong) break;
  }

  // nothing passed for the exact dish: show a real photo of the dish's key veg ingredient
  // instead of an empty card, and say plainly that it is a close match
  if (!best && hero) {
    const hits = await search(hero === "paneer" ? "paneer dish" : `${hero} dish`);
    const more = hits.length ? [] : await search(hero);
    const pick = [...hits, ...more].slice(0, 20).find((h) => {
      const text = norm(h.text);
      return has(text, hero) && !MEAT.test(text) && !PEOPLE.test(text);
    });
    if (pick) {
      const v: DishPhoto = {
        src: pick.square,
        srcWide: pick.wide,
        alt: pick.text.trim().split("\n")[0].trim() || `A ${hero} dish`,
        avgColor: pick.color,
        photographer: pick.photographer,
        photographerUrl: pick.photographerUrl,
        photoUrl: pick.photoUrl,
        source: pick.source,
        match: "similar",
        anchor: `a ${hero} dish`,
      };
      trackUse(pick);
      cache.set(n, { at: Date.now(), v });
      persist();
      return v;
    }
  }

  const v: DishPhoto | null = best
    ? {
        src: best.h.square,
        srcWide: best.h.wide,
        alt: best.h.text.trim() || dish,
        avgColor: best.h.color,
        photographer: best.h.photographer,
        photographerUrl: best.h.photographerUrl,
        photoUrl: best.h.photoUrl,
        source: best.h.source,
        match: best.strong && best.s >= 20 + modifiers.length * 3 ? "exact" : "similar",
        anchor: anchor ?? tokens.join(" "),
      }
    : null;
  if (best) trackUse(best.h);
  cache.set(n, { at: Date.now(), v });
  persist();
  if (cache.size > 800) cache.delete(cache.keys().next().value as string);
  return v;
}
