import { plan, FriendIn, Occasion, PlanResult } from "@/lib/agent";
import { narrate } from "@/lib/llm";
import { QlooError } from "@/lib/qloo";
import { isStr, json, rateLimited } from "@/lib/guard";

export const maxDuration = 60;

const OCCASIONS: Occasion[] = ["coffee", "meal", "dessert"];

function validate(body: unknown): { friends: FriendIn[]; city: string; occasion: Occasion } | string {
  if (!body || typeof body !== "object") return "Bad request.";
  const b = body as Record<string, unknown>;
  const city = isStr(b.city, 60) ? b.city.trim() : "";
  if (!city) return "Pick a city.";
  const occasion = OCCASIONS.includes(b.occasion as Occasion) ? (b.occasion as Occasion) : "coffee";
  if (!Array.isArray(b.friends) || b.friends.length < 1 || b.friends.length > 6) return "Add between one and six people.";
  const friends: FriendIn[] = [];
  for (const [i, raw] of b.friends.entries()) {
    const f = raw as { loves?: unknown; veg?: unknown };
    const loves = Array.isArray(f.loves) ? f.loves : [];
    const clean = loves
      .map((l) => l as { id?: unknown; name?: unknown; kind?: unknown })
      .filter((l) => isStr(l.id, 64) && /^[A-F0-9-]{20,40}$/i.test(l.id as string) && isStr(l.name, 120))
      .slice(0, 3)
      .map((l) => ({ id: l.id as string, name: l.name as string, kind: isStr(l.kind, 20) ? (l.kind as string) : "" }));
    if (!clean.length) return `Person ${i + 1} needs at least one confirmed love.`;
    // Keys are positional letters. Display names never reach the server.
    friends.push({ key: String.fromCharCode(65 + i), loves: clean, veg: f.veg === true });
  }
  return { friends, city, occasion };
}

export async function POST(req: Request) {
  if (rateLimited(req, "plan", 12, 60_000)) return json({ error: "Slow down a little and try again in a minute." }, 429);
  const parsed = validate(await req.json().catch(() => null));
  if (typeof parsed === "string") return json({ error: parsed }, 400);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      try {
        let result: PlanResult | undefined;
        for await (const ev of plan(parsed)) {
          if (ev.type === "result") result = ev;
          send(ev);
        }
        if (result?.picks.length) {
          send({ type: "step", id: "explain", label: "Writing the why", status: "running" });
          const narrations = await Promise.all(
            result.picks.map((pk) =>
              narrate({
                occasion: result!.occasion,
                city: result!.city,
                friends: parsed.friends.map((f) => {
                  const prof = result!.profiles.find((p) => p.key === f.key);
                  return {
                    key: f.key,
                    loves: f.loves.map((l) => l.name),
                    topCuisine: prof?.cuisines[0]?.name,
                    topAmbience: prof?.ambience[0]?.name,
                  };
                }),
                pick: {
                  name: pk.name,
                  area: pk.area,
                  vibe: pk.vibe,
                  perFriend: pk.friends.map((ff) => ({
                    key: ff.key,
                    cuisines: ff.matched.filter((m) => m.kind === "cuisine").map((m) => m.name),
                    ambience: ff.matched.filter((m) => m.kind === "ambience").map((m) => m.name),
                    order: ff.order?.dish,
                    orderKind: ff.order?.kind,
                    matchedCuisine: ff.order?.matchedCuisine,
                    veg: parsed.friends.find((f) => f.key === ff.key)?.veg,
                    vegNote: ff.vegNote,
                  })),
                },
              }),
            ),
          );
          send({ type: "narration", items: result.picks.map((pk, i) => ({ id: pk.id, ...narrations[i] })) });
          send({ type: "step", id: "explain", label: "Writing the why", detail: `via ${narrations[0].via}`, status: "done" });
        }
        send({ type: "end" });
      } catch (err) {
        const e = err as QlooError;
        send({ type: "error", message: e.message ?? "Something went wrong.", kind: e.kind ?? "upstream" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
