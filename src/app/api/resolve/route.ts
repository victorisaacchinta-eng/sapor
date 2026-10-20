import { resolveLove } from "@/lib/agent";
import { QlooError } from "@/lib/qloo";
import { isStr, json, rateLimited } from "@/lib/guard";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (rateLimited(req, "resolve", 40, 60_000)) return json({ error: "Slow down a little and try again in a minute." }, 429);
  const body = (await req.json().catch(() => null)) as { loves?: unknown } | null;
  const loves = Array.isArray(body?.loves) ? body!.loves.filter((l) => isStr(l, 90)).slice(0, 18) : [];
  if (!loves.length) return json({ error: "Add at least one film, show, artist or book." }, 400);
  try {
    const unique = [...new Set(loves.map((l) => (l as string).trim()))];
    const results = await Promise.all(unique.map((l) => resolveLove(l)));
    return json({ results });
  } catch (err) {
    const e = err as QlooError;
    return json({ error: e.message ?? "Could not reach Qloo.", kind: e.kind }, e.kind === "rate_limit" ? 429 : 502);
  }
}
