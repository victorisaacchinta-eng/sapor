import { parseTable } from "@/lib/llm";
import { isStr, json, rateLimited } from "@/lib/guard";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (rateLimited(req, "parse", 30, 60_000)) return json({ error: "Slow down a little and try again in a minute." }, 429);
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || !isStr(body.text, 800)) return json({ error: "Tell Sapor who is coming and what they love." }, 400);
  const out = await parseTable(body.text);
  return json(out);
}
