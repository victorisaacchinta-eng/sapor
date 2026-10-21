import "server-only";

/**
 * Thin, server-only client for the Qloo hackathon API.
 *
 * Rules this file enforces:
 * - The key is read from the server environment and never leaves this module.
 * - Only taste entities and tag ids are ever sent. No names, emails or device ids.
 * - Retries are bounded (one retry on 429 / 5xx) and every response is cached
 *   briefly so judges clicking around do not burn the event quota.
 */

const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";
const TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const CACHE_MAX = 800;

export class QlooError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "rate_limit" | "bad_request" | "upstream" | "timeout" | "config",
    public readonly status?: number,
  ) {
    super(message);
  }
}

export type QlooRequestLog = {
  path: string;
  params: Record<string, string>;
  ms: number;
  cached: boolean;
};

type CacheEntry = { at: number; value: unknown };
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  // refresh LRU position
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(key: string, value: unknown) {
  cache.set(key, { at: Date.now(), value });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function qlooGet<T>(
  path: string,
  params: Record<string, string | number | boolean | undefined>,
  log?: QlooRequestLog[],
): Promise<T> {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new QlooError("QLOO_API_KEY is not set on the server.", "config");

  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    clean[k] = String(v);
  }
  const qs = new URLSearchParams(Object.entries(clean).sort(([a], [b]) => a.localeCompare(b)));
  const url = `${BASE}${path}?${qs.toString()}`;
  const cacheKey = url;

  const started = Date.now();
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) {
    log?.push({ path, params: clean, ms: 0, cached: true });
    return cached as T;
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { "X-Api-Key": key, Accept: "application/json" },
        signal: ctrl.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (res.status === 401 || res.status === 403) {
        throw new QlooError("Qloo rejected the credential.", "auth", res.status);
      }
      if (res.status === 429) {
        lastErr = new QlooError("Qloo rate limit reached. Try again in a minute.", "rate_limit", 429);
        await sleep(1200);
        continue;
      }
      if (res.status >= 500) {
        lastErr = new QlooError(`Qloo upstream error ${res.status}.`, "upstream", res.status);
        await sleep(600);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new QlooError(`Qloo returned ${res.status}: ${body.slice(0, 200)}`, "bad_request", res.status);
      }
      const json = (await res.json()) as T;
      cacheSet(cacheKey, json);
      log?.push({ path, params: clean, ms: Date.now() - started, cached: false });
      return json;
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof QlooError && (err.kind === "auth" || err.kind === "bad_request")) throw err;
      if ((err as Error)?.name === "AbortError") {
        lastErr = new QlooError("Qloo took too long to answer.", "timeout");
        continue;
      }
      lastErr = err;
    }
  }
  if (lastErr instanceof QlooError) throw lastErr;
  throw new QlooError(`Could not reach Qloo: ${(lastErr as Error)?.message ?? "unknown"}`, "upstream");
}

/* ------------------------------------------------------------------ */
/* Typed slices of the Qloo responses Sapor actually uses               */
/* ------------------------------------------------------------------ */

export type QlooTag = {
  tag_id?: string;
  id?: string;
  name: string;
  type?: string;
  subtype?: string;
  value?: string;
  query?: { affinity?: number };
};

export type QlooEntity = {
  entity_id: string;
  name: string;
  types?: string[];
  subtype?: string;
  popularity?: number;
  disambiguation?: string;
  properties?: {
    short_description?: string;
    description?: string;
    release_year?: number;
    address?: string;
    business_rating?: number;
    price_level?: number | null;
    image?: { url?: string };
    geocode?: { name?: string; city?: string; country?: string };
    [k: string]: unknown;
  };
  location?: { lat?: number; lon?: number };
  tags?: QlooTag[];
  query?: {
    affinity?: number;
    distance?: number;
    explainability?: { "signal.interests.entities"?: { entity_id: string; score: number }[] };
  };
};

export const TASTE_TYPES = [
  "urn:entity:artist",
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:book",
  "urn:entity:podcast",
  "urn:entity:videogame",
] as const;

export async function searchTaste(query: string, log?: QlooRequestLog[]) {
  const r = await qlooGet<{ results?: QlooEntity[] }>(
    "/search",
    { query, types: TASTE_TYPES.join(","), take: 6 },
    log,
  );
  return r.results ?? [];
}

export async function tasteTags(entityIds: string[], log?: QlooRequestLog[]) {
  const r = await qlooGet<{ results?: { tags?: QlooTag[] } }>(
    "/v2/insights",
    {
      "filter.type": "urn:tag",
      "signal.interests.entities": entityIds.join(","),
      "filter.tag.types": "urn:tag:cuisine:qloo,urn:tag:ambience:qloo",
      take: 40,
    },
    log,
  );
  return r.results?.tags ?? [];
}

export async function placesFor(
  opts: {
    entityIds: string[];
    signalTags?: string[];
    venueTag: string;
    city: string;
    take?: number;
  },
  log?: QlooRequestLog[],
) {
  const r = await qlooGet<{ results?: { entities?: QlooEntity[] } }>(
    "/v2/insights",
    {
      "filter.type": "urn:entity:place",
      "signal.interests.entities": opts.entityIds.join(","),
      "signal.interests.tags": opts.signalTags?.length ? opts.signalTags.join(",") : undefined,
      "filter.tags": opts.venueTag,
      "filter.location.query": opts.city,
      "feature.explainability": true,
      take: opts.take ?? 30,
    },
    log,
  );
  return r.results?.entities ?? [];
}

export function tagId(t: QlooTag) {
  return t.tag_id ?? t.id ?? "";
}

export function tagKind(t: QlooTag): string {
  const ty = t.subtype ?? t.type ?? tagId(t);
  // "urn:tag:cuisine:qloo" or "urn:tag:menu_highlight:qloo:..." -> "cuisine" / "menu_highlight"
  return ty.split(":")[2] ?? "";
}
