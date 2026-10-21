import "server-only";

/**
 * One small language layer, with a fallback chain of free OpenAI-compatible
 * providers. Sapor works without any of them: parsing falls back to a simple
 * "Name: thing, thing" reader and the explanations fall back to templates.
 *
 * Privacy: prompts carry friend aliases ("A", "B"), never the names people
 * typed, and never anything sent to or from Qloo besides public entity names
 * and tag names.
 */

type Provider = { name: string; url: string; key?: string; model: string };

function providers(): Provider[] {
  const list: Provider[] = [
    {
      name: "groq",
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      model: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
    },
    {
      name: "cerebras",
      url: "https://api.cerebras.ai/v1/chat/completions",
      key: process.env.CEREBRAS_API_KEY,
      model: process.env.CEREBRAS_MODEL ?? "gpt-oss-120b",
    },
    {
      name: "gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest",
    },
  ];
  return list.filter((p) => p.key);
}

export function llmAvailable() {
  return providers().length > 0;
}

type Msg = { role: "system" | "user"; content: string };

async function completeJSON<T>(messages: Msg[], maxTokens = 900): Promise<{ data: T; provider: string } | null> {
  for (const p of providers()) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    try {
      const res = await fetch(p.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: p.model,
          messages,
          temperature: 0.4,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          // gpt-oss on Groq reasons before answering; keep it short to stay inside the free token budget
          ...(p.name === "groq" ? { reasoning_effort: "low" } : {}),
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue; // rate limited or down: try the next provider
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content ?? "";
      const json = extractJSON(text);
      if (json) return { data: json as T, provider: p.name };
    } catch {
      clearTimeout(timer);
    }
  }
  return null;
}

function extractJSON(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** House style: no em dashes in anything Sapor says. */
export function clean(s: string) {
  return s
    .replace(/[‐‑‒]/g, "-")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Parsing a free-text table                                            */
/* ------------------------------------------------------------------ */

export type ParsedFriend = { name: string; loves: string[] };

export function heuristicParse(text: string): ParsedFriend[] {
  // "Riya: BTS, Squid Game / Arjun - Pushpa, DSP" or one person per line
  const chunks = text
    .split(/\n|;|\s\/\s|\|/)
    .map((c) => c.trim())
    .filter(Boolean);
  const out: ParsedFriend[] = [];
  for (const c of chunks) {
    const m = c.match(/^([^:=\-]{1,24})\s*(?::|=|\s-\s|loves|likes)\s*(.+)$/i);
    if (!m) continue;
    const loves = m[2]
      .split(/,|&|\band\b|\+/i)
      .map((s) => s.trim().replace(/^the\s+band\s+/i, ""))
      .filter((s) => s.length > 1)
      .slice(0, 3);
    if (loves.length) out.push({ name: m[1].trim(), loves });
  }
  return out.slice(0, 6);
}

export async function parseTable(text: string): Promise<{ friends: ParsedFriend[]; via: string }> {
  const trimmed = text.slice(0, 800);
  if (llmAvailable()) {
    const r = await completeJSON<{ friends?: ParsedFriend[] }>([
      {
        role: "system",
        content:
          "You extract a dining group from a short message. Return JSON {\"friends\":[{\"name\":string,\"loves\":[string]}]}. " +
          "Each friend has 1 to 3 loves: a specific film, TV show, music artist, book, podcast or video game, written as its title or name. " +
          "If a love is a vague genre (\"rom-coms\", \"rap\"), keep it as written. If the writer includes themselves (\"me\", \"I\"), name them \"You\". " +
          "If no names are given, use \"Friend 1\", \"Friend 2\". Write each love as its plain title with no brackets, unless the message itself names a type, " +
          "in which case add one word in brackets: film, show, book, artist, podcast or game, for example \"Dune (book)\". Maximum 6 friends. Never invent loves.",
      },
      { role: "user", content: trimmed },
    ]);
    const fr = r?.data.friends?.filter((f) => f && typeof f.name === "string" && Array.isArray(f.loves));
    if (fr?.length) {
      return {
        friends: fr.slice(0, 6).map((f) => ({ name: f.name.slice(0, 24), loves: f.loves.map(String).filter(Boolean).slice(0, 3) })),
        via: r!.provider,
      };
    }
  }
  return { friends: heuristicParse(trimmed), via: "rules" };
}

/* ------------------------------------------------------------------ */
/* Explaining a pick                                                    */
/* ------------------------------------------------------------------ */

export type NarrateInput = {
  occasion: string;
  city: string;
  friends: { key: string; loves: string[]; topCuisine?: string; topAmbience?: string }[];
  pick: {
    name: string;
    area?: string;
    vibe: string[];
    perFriend: {
      key: string;
      cuisines: string[];
      ambience: string[];
      order?: string;
      orderKind?: string;
      matchedCuisine?: string;
      veg?: boolean;
      vegNote?: string;
    }[];
  };
};

export type Narration = { headline: string; why: string; lines: Record<string, string>; via: string };

export function templateNarration(n: NarrateInput): Narration {
  const lines: Record<string, string> = {};
  for (const pf of n.pick.perFriend) {
    const f = n.friends.find((x) => x.key === pf.key);
    const loves = f?.loves.slice(0, 2).join(" and ") || "their picks";
    const room = pf.ambience[0]?.toLowerCase();
    const vegBit = pf.veg && pf.vegNote === "no_veg" ? " Heads up: nothing vegetarian shows on its highlights." : "";
    if (pf.order && pf.orderKind === "taste_match") {
      lines[pf.key] = `People who love ${loves} lean ${pf.matchedCuisine}${room ? ` and like ${room} rooms` : ""}. Order the ${pf.order}.${vegBit}`;
    } else if (pf.order) {
      lines[pf.key] = room
        ? `People who love ${loves} tend to like ${room} rooms. No highlight maps to their cuisines, so start with a house favourite: ${pf.order}.${vegBit}`
        : `A looser match on paper. Start with a house favourite: ${pf.order}.${vegBit}`;
    } else {
      lines[pf.key] = pf.veg
        ? `Nothing vegetarian shows on Qloo's highlights here, so ask the staff.`
        : room
          ? `Their crowd tends to like ${room} rooms.`
          : "A looser match on paper.";
    }
  }
  const vibe = n.pick.vibe.slice(0, 3).join(", ").toLowerCase();
  return {
    headline: n.pick.name,
    why: vibe ? `Where everyone's taste overlaps. Qloo tags the room ${vibe}.` : "Where everyone's taste overlaps.",
    lines,
    via: "template",
  };
}

/** Rejects model copy that breaks Sapor's honesty rules, so the template is used instead. */
const BANNED = /\b(you|your|yours|you'll|you're|delicious|tasty|amazing|perfect|best|great|guaranteed|will love|definitely)\b/i;
const okLine = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 8 && v.length < max && !BANNED.test(v);

const narrationCache = new Map<string, Narration>();

export async function narrate(n: NarrateInput): Promise<Narration> {
  const fallback = templateNarration(n);
  if (!llmAvailable()) return fallback;
  const cacheKey = JSON.stringify(n);
  const hit = narrationCache.get(cacheKey);
  if (hit) return hit;
  const out = await narrateFresh(n, fallback);
  if (out.via !== "template") {
    narrationCache.set(cacheKey, out);
    if (narrationCache.size > 400) narrationCache.delete(narrationCache.keys().next().value as string);
  }
  return out;
}

async function narrateFresh(n: NarrateInput, fallback: Narration): Promise<Narration> {
  const r = await completeJSON<{ why?: string; lines?: Record<string, string> }>(
    [
      {
        role: "system",
        content:
          "You write short, warm, specific copy for Sapor, a taste agent that picks where a group should go. " +
          "Use ONLY the facts in the JSON. Never invent dishes, ratings, prices, distances or tags. " +
          "Qloo data describes what people with similar taste tend to like, not what one person will do, so phrase it that way " +
          "(\"people who love Squid Game tend to...\"), never \"you will love\". " +
          "If orderKind is house_favourite, say plainly it is a house favourite rather than a taste match. " +
          "Write in the third person about groups of people. Never address the reader: no you, your or yours. " +
          "Never praise food or places with words that are not in the facts (no great, delicious, tasty, amazing, perfect, best). " +
          "Do not use em dashes. British spelling. " +
          "Return JSON {\"why\": one sentence under 22 words on why this place fits the whole table, \"lines\": {friendKey: one sentence under 24 words}}.",
      },
      { role: "user", content: JSON.stringify(n) },
    ],
    700,
  );
  if (!r) return fallback;
  const lines: Record<string, string> = { ...fallback.lines };
  let used = 0;
  for (const [k, v] of Object.entries(r.data.lines ?? {})) {
    if (lines[k] !== undefined && okLine(v, 240)) {
      lines[k] = clean(v);
      used += 1;
    }
  }
  const whyOk = okLine(r.data.why, 200);
  const why = whyOk ? clean(r.data.why as string) : fallback.why;
  if (!used && !whyOk) return fallback;
  return { headline: n.pick.name, why, lines, via: r.provider };
}
