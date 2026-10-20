import "server-only";

/** Small per-IP limiter so a public demo cannot drain the event quota. */
const hits = new Map<string, number[]>();

export function rateLimited(req: Request, bucket: string, max: number, windowMs: number) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const isStr = (v: unknown, max = 120): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;
