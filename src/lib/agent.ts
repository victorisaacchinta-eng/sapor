import "server-only";
import {
  placesFor,
  QlooEntity,
  QlooRequestLog,
  QlooTag,
  searchTaste,
  tagId,
  tagKind,
  tasteTags,
} from "./qloo";
import { pickDish, DishPick, isVeg } from "./dishes";

/* ------------------------------------------------------------------ */
/* Resolution: turn what a friend typed into one Qloo entity            */
/* ------------------------------------------------------------------ */

export type Candidate = {
  id: string;
  name: string;
  kind: string; // artist, movie, tv_show, book, podcast, videogame
  year?: number;
  blurb?: string;
  popularity: number;
};

export type Resolution =
  | { input: string; status: "resolved"; chosen: Candidate; alternatives: Candidate[] }
  | { input: string; status: "ambiguous"; options: Candidate[] }
  | { input: string; status: "not_found" };

const KIND_HINTS: Record<string, string> = {
  film: "movie",
  movie: "movie",
  show: "tv_show",
  series: "tv_show",
  tv: "tv_show",
  anime: "tv_show",
  band: "artist",
  artist: "artist",
  singer: "artist",
  music: "artist",
  book: "book",
  novel: "book",
  podcast: "podcast",
  game: "videogame",
};

function kindOf(e: QlooEntity): string {
  const t = e.types?.[0] ?? e.subtype ?? "";
  return t.split(":").pop() ?? "";
}

function toCandidate(e: QlooEntity): Candidate {
  const p = e.properties ?? {};
  const blurb = (p.short_description || p.description || e.disambiguation || "").toString();
  return {
    id: e.entity_id,
    name: e.name,
    kind: kindOf(e),
    year: typeof p.release_year === "number" ? p.release_year : undefined,
    blurb: blurb ? blurb.slice(0, 140) : undefined,
    popularity: e.popularity ?? 0,
  };
}

// "Dune (Dune, #1)" -> "dune"; "A. R. Rahman" -> "arrahman"
const simpleName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "");

/** "Dune (book)" -> { text: "Dune", kind: "book" } */
function splitHint(raw: string): { text: string; kind?: string } {
  const m = raw.match(/^(.*?)[\s]*\(([^)]+)\)\s*$/);
  if (!m) return { text: raw.trim() };
  const hint = KIND_HINTS[m[2].trim().toLowerCase()];
  return hint ? { text: m[1].trim(), kind: hint } : { text: raw.trim() };
}

export async function resolveLove(raw: string, log?: QlooRequestLog[]): Promise<Resolution> {
  const input = raw.trim();
  const { text, kind } = splitHint(input);
  if (!text) return { input, status: "not_found" };
  const results = (await searchTaste(text, log)).map(toCandidate).filter((c) => c.kind);
  const pool = kind ? results.filter((c) => c.kind === kind) : results;
  if (!pool.length) return { input, status: "not_found" };

  const top = pool[0];
  // The agent stops and asks when another candidate with the same name but a
  // different kind is nearly as popular. Picking silently would change the
  // taste profile (Dune the film and Dune the techno group are different crowds).
  // Spin-offs ("BTS World", "Squid Game: Unleashed") are not rivals: only an
  // exact name clash across kinds counts.
  const topName = simpleName(top.name);
  const rivals = pool
    .slice(1)
    .filter((c) => c.kind !== top.kind && simpleName(c.name) === topName && c.popularity >= top.popularity - 0.03);
  if (!kind && rivals.length) {
    const seen = new Set<string>();
    const options = [top, ...rivals].filter((c) => (seen.has(c.kind) ? false : (seen.add(c.kind), true)));
    return { input, status: "ambiguous", options: options.slice(0, 3) };
  }
  return { input, status: "resolved", chosen: top, alternatives: pool.slice(1, 4) };
}

/* ------------------------------------------------------------------ */
/* Planning                                                            */
/* ------------------------------------------------------------------ */

export type Occasion = "coffee" | "meal" | "dessert";

const VENUE_TAGS: Record<Occasion, { primary: string; fallback: string[]; label: string }> = {
  coffee: {
    primary: "urn:tag:genre:place:restaurant:cafe",
    fallback: ["urn:tag:genre:place:restaurant:coffee_shop", "urn:tag:genre:place:restaurant:restaurant_or_cafe"],
    label: "cafe",
  },
  meal: {
    primary: "urn:tag:genre:place:restaurant",
    fallback: ["urn:tag:genre:place:restaurant:restaurant_or_cafe"],
    label: "restaurant",
  },
  dessert: {
    primary: "urn:tag:genre:place:restaurant:dessert_shop",
    fallback: ["urn:tag:genre:place:restaurant:bakery", "urn:tag:genre:place:restaurant:ice_cream_shop", "urn:tag:genre:place:restaurant:cafe"],
    label: "dessert spot",
  },
};

export type FriendIn = {
  key: string; // "A", "B" ... (the display name stays in the browser)
  loves: { id: string; name: string; kind: string }[];
  veg?: boolean;
};

export type TasteWeight = { id: string; name: string; affinity: number };
export type FriendProfile = {
  key: string;
  cuisines: TasteWeight[];
  ambience: TasteWeight[];
};

export type FriendFit = {
  key: string;
  fit: number; // 0..1
  tagFit: number; // 0..1
  share: number; // Qloo explainability share for this friend's loves, 0..1
  matched: { name: string; kind: "cuisine" | "ambience"; affinity: number }[];
  vegNote?: "veg_friendly" | "few_veg" | "no_veg";
  order?: DishPick;
};

export type Pick = {
  id: string;
  name: string;
  area?: string;
  address?: string;
  image?: string;
  rating?: number;
  priceLevel?: number | null;
  lat?: number;
  lon?: number;
  qlooAffinity: number;
  tableScore: number;
  fairness: number; // lowest fit / mean fit, 0..1
  friends: FriendFit[];
  vibe: string[]; // ambience / decor / noise tags of the venue
  cuisines: string[];
  menu: string[];
};

export type StepEvent = {
  type: "step";
  id: string;
  label: string;
  detail?: string;
  status: "running" | "done" | "warn";
};

export type PlanResult = {
  type: "result";
  occasion: Occasion;
  city: string;
  venueLabel: string;
  profiles: FriendProfile[];
  sharedTaste: TasteWeight[];
  picks: Pick[];
  relaxations: string[];
  considered: number;
  rejected: { name: string; reason: string }[];
  qloo: { calls: number; cached: number; requests: QlooRequestLog[] };
};

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function weights(tags: QlooTag[], kind: string): TasteWeight[] {
  return tags
    .filter((t) => tagKind(t) === kind)
    .map((t) => ({ id: tagId(t), name: t.name, affinity: round(t.query?.affinity ?? 0) }))
    .filter((t) => t.id)
    .sort((a, b) => b.affinity - a.affinity)
    .slice(0, 12);
}

/** Tags most of the table leans toward. Used as tag signals for the venue search. */
function sharedTaste(profiles: FriendProfile[]): TasteWeight[] {
  const acc = new Map<string, { name: string; sum: number; count: number }>();
  for (const p of profiles) {
    for (const t of [...p.cuisines.slice(0, 6), ...p.ambience.slice(0, 6)]) {
      const cur = acc.get(t.id) ?? { name: t.name, sum: 0, count: 0 };
      cur.sum += t.affinity;
      cur.count += 1;
      acc.set(t.id, cur);
    }
  }
  const n = profiles.length;
  return [...acc.entries()]
    .map(([id, v]) => ({ id, name: v.name, affinity: round((v.sum / n) * (n > 1 ? 0.5 + 0.5 * (v.count / n) : 1)) }))
    .sort((a, b) => b.affinity - a.affinity);
}

function hasFood(e: QlooEntity) {
  return (e.tags ?? []).some((t) => {
    const k = tagKind(t);
    return k === "cuisine" || k === "menu_highlight";
  });
}

function scorePlace(e: QlooEntity, profiles: FriendProfile[], friends: FriendIn[]): Pick {
  const tags = e.tags ?? [];
  const placeTagIds = new Set(tags.map(tagId));
  const menu = tags.filter((t) => tagKind(t) === "menu_highlight").map((t) => t.name);
  const cuisines = tags.filter((t) => tagKind(t) === "cuisine").map((t) => t.name);
  const vibe = tags
    .filter((t) => ["ambience", "decor"].includes(tagKind(t)))
    .map((t) => t.name);

  // Qloo explainability: how much each signal entity contributed to this venue.
  const ex = e.query?.explainability?.["signal.interests.entities"] ?? [];
  const exTotal = ex.reduce((s, x) => s + x.score, 0) || 1;
  const owner = new Map<string, string>();
  for (const f of friends) for (const l of f.loves) owner.set(l.id, f.key);
  const shareBy = new Map<string, number>();
  for (const x of ex) {
    const k = owner.get(x.entity_id);
    if (k) shareBy.set(k, (shareBy.get(k) ?? 0) + x.score / exTotal);
  }

  const vegDishes = menu.filter(isVeg).length;
  const vegTagged = tags.some((t) => /vegetarian|vegan/i.test(t.name) && ["dietary_option", "cuisine"].includes(tagKind(t)));

  const n = profiles.length;
  const fits: FriendFit[] = profiles.map((p) => {
    const veg = friends.find((f) => f.key === p.key)?.veg;
    const all = [
      ...p.cuisines.map((t) => ({ ...t, kind: "cuisine" as const })),
      ...p.ambience.map((t) => ({ ...t, kind: "ambience" as const })),
    ];
    const matched = all.filter((t) => placeTagIds.has(t.id)).sort((a, b) => b.affinity - a.affinity);
    // Cap at the person's three strongest tags so a venue with dozens of tags
    // does not win by volume.
    const ceiling = all.map((t) => t.affinity).sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0) || 1;
    const tagFit = Math.min(1, matched.slice(0, 3).reduce((s, t) => s + t.affinity, 0) / ceiling);
    const share = shareBy.get(p.key) ?? 1 / n;
    let fit = 0.75 * tagFit + 0.25 * Math.min(1, share * n);
    let vegNote: FriendFit["vegNote"];
    if (veg) {
      // A venue with nothing vegetarian on its highlights is a poor pick for a
      // vegetarian however well the taste lines up.
      if (vegDishes === 0 && !vegTagged) { fit *= 0.55; vegNote = "no_veg"; }
      else if (vegTagged) { fit = Math.min(1, fit * 1.06); vegNote = "veg_friendly"; }
      else if (vegDishes < 2) { fit *= 0.85; vegNote = "few_veg"; }
    }
    return {
      key: p.key,
      vegNote,
      fit: round(fit),
      tagFit: round(tagFit),
      share: round(share),
      matched: matched.slice(0, 4).map((t) => ({ name: t.name, kind: t.kind, affinity: t.affinity })),
    };
  });

  const mean = fits.reduce((s, f) => s + f.fit, 0) / Math.max(1, fits.length);
  const low = Math.min(...fits.map((f) => f.fit));
  const affinity = e.query?.affinity ?? 0;
  // Mean rewards a good overall fit; the lowest fit makes sure nobody is left out.
  const tableScore = affinity * (0.4 + 0.6 * ((mean + low) / 2));

  const p = e.properties ?? {};
  const images = (p as { images?: { url?: string }[] }).images;
  return {
    id: e.entity_id,
    name: e.name,
    area: p.geocode?.name?.replace(/^Ward \d+\s*/i, "") || undefined,
    address: p.address,
    image: images?.[0]?.url ?? p.image?.url,
    rating: typeof p.business_rating === "number" ? round(p.business_rating, 1) : undefined,
    priceLevel: p.price_level ?? null,
    lat: e.location?.lat,
    lon: e.location?.lon,
    qlooAffinity: round(affinity),
    tableScore: round(tableScore),
    fairness: round(mean > 0 ? low / mean : 0),
    friends: fits,
    vibe: [...new Set(vibe)].slice(0, 8),
    cuisines: [...new Set(cuisines)].slice(0, 8),
    menu: [...new Set(menu)].slice(0, 14),
  };
}

export async function* plan(
  input: { friends: FriendIn[]; city: string; occasion: Occasion },
): AsyncGenerator<StepEvent | PlanResult> {
  const log: QlooRequestLog[] = [];
  const { friends, city, occasion } = input;
  const venue = VENUE_TAGS[occasion];
  const relaxations: string[] = [];

  // 1. Profiles
  yield { type: "step", id: "profile", label: "Reading each person's taste", status: "running" };
  const profiles: FriendProfile[] = await Promise.all(
    friends.map(async (f) => {
      const tags = await tasteTags(f.loves.map((l) => l.id), log);
      return { key: f.key, cuisines: weights(tags, "cuisine"), ambience: weights(tags, "ambience") };
    }),
  );
  const thin = profiles.filter((p) => p.cuisines.length + p.ambience.length === 0).map((p) => p.key);
  yield {
    type: "step",
    id: "profile",
    label: "Reading each person's taste",
    detail: profiles
      .map((p) => `${p.key}: ${[p.cuisines[0]?.name, p.ambience[0]?.name].filter(Boolean).join(", ") || "no dining signal"}`)
      .join("  ·  "),
    status: thin.length ? "warn" : "done",
  };

  // 2. Shared taste
  const shared = sharedTaste(profiles);
  const signalTags = shared.slice(0, 3).map((t) => t.id);
  yield {
    type: "step",
    id: "shared",
    label: "Finding where the table overlaps",
    detail: shared.slice(0, 4).map((t) => t.name).join(", ") || "no overlap, using each person's loves directly",
    status: "done",
  };

  // 3. Venue search with guardrails and bounded relaxation
  const allIds = friends.flatMap((f) => f.loves.map((l) => l.id));
  yield { type: "step", id: "search", label: `Searching ${venue.label}s in ${city}`, status: "running" };
  const attempts: { venueTag: string; tags?: string[]; note?: string }[] = [
    { venueTag: venue.primary, tags: signalTags },
    { venueTag: venue.primary, note: "Dropped the shared-taste tag signals to widen the search." },
    ...venue.fallback.map((v) => ({ venueTag: v, note: `Widened the venue type to ${v.split(":").pop()?.replace(/_/g, " ")}.` })),
  ];
  const candidates: QlooEntity[] = [];
  const rejected: { name: string; reason: string }[] = [];
  for (const a of attempts) {
    if (a.note) relaxations.push(a.note);
    const found = await placesFor({ entityIds: allIds, signalTags: a.tags, venueTag: a.venueTag, city, take: 30 }, log);
    const seen = new Set(candidates.map((c) => c.entity_id));
    for (const e of found) {
      if (seen.has(e.entity_id)) continue;
      if (!hasFood(e)) {
        rejected.push({ name: e.name, reason: "No cuisine or menu data in Qloo, so it may not be a food venue." });
        continue;
      }
      candidates.push(e);
    }
    if (candidates.length >= 6) break;
  }
  if (!candidates.length) {
    yield { type: "step", id: "search", label: `Searching ${venue.label}s in ${city}`, detail: "Qloo returned no food venues here.", status: "warn" };
  } else {
    yield {
      type: "step",
      id: "search",
      label: `Searching ${venue.label}s in ${city}`,
      detail: `${candidates.length} venues with menu data${rejected.length ? `, ${rejected.length} set aside` : ""}${relaxations.length ? " (search widened)" : ""}`,
      status: relaxations.length ? "warn" : "done",
    };
  }

  // 4. Fairness re-rank. Every candidate gets its orders first, because a
  // venue where someone can actually order something that fits them is a
  // better pick for that person than one where they can't.
  yield { type: "step", id: "fit", label: "Scoring every venue for every person", status: "running" };
  const scored = candidates.map((e) => {
    const pk = scorePlace(e, profiles, friends);
    const taken = new Set<string>();
    for (const f of pk.friends) {
      const prof = profiles.find((p) => p.key === f.key)!;
      const veg = friends.find((x) => x.key === f.key)?.veg;
      const d = pickDish(prof.cuisines, pk.menu, taken, veg, occasion);
      if (d) {
        f.order = d;
        taken.add(d.dish);
      }
      const adj = !d ? -0.08 : d.kind === "taste_match" ? 0.06 : -0.04;
      f.fit = round(Math.max(0, Math.min(1, f.fit + adj)));
    }
    const mean = pk.friends.reduce((a, f) => a + f.fit, 0) / Math.max(1, pk.friends.length);
    const low = Math.min(...pk.friends.map((f) => f.fit));
    pk.tableScore = round(pk.qlooAffinity * (0.4 + 0.6 * ((mean + low) / 2)));
    pk.fairness = round(mean > 0 ? low / mean : 0);
    return pk;
  });
  scored.sort((a, b) => b.tableScore - a.tableScore);
  const picks = scored.slice(0, 3);
  yield {
    type: "step",
    id: "fit",
    label: "Scoring every venue for every person",
    detail: picks[0]
      ? `${picks[0].name} fits the whole table best (lowest fit is ${Math.round(picks[0].fairness * 100)}% of the average)`
      : "Nothing to score",
    status: picks.length ? "done" : "warn",
  };

  yield {
    type: "result",
    occasion,
    city,
    venueLabel: venue.label,
    profiles,
    sharedTaste: shared.slice(0, 8),
    picks,
    relaxations,
    considered: candidates.length,
    rejected: rejected.slice(0, 6),
    qloo: { calls: log.filter((l) => !l.cached).length, cached: log.filter((l) => l.cached).length, requests: log },
  };
}
