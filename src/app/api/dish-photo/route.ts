import { findDishPhoto } from "@/lib/photos";
import { isStr, rateLimited } from "@/lib/guard";

export const maxDuration = 20;

export async function GET(req: Request) {
  if (rateLimited(req, "dish-photo", 90, 60_000)) {
    return new Response(JSON.stringify({ photo: null }), { status: 429, headers: { "Content-Type": "application/json" } });
  }
  const d = new URL(req.url).searchParams.get("d") ?? "";
  if (!isStr(d, 90)) return new Response(JSON.stringify({ photo: null }), { status: 400, headers: { "Content-Type": "application/json" } });
  const photo = await findDishPhoto(d);
  return new Response(JSON.stringify({ photo }), {
    headers: {
      "Content-Type": "application/json",
      // one lookup per dish, shared by every visitor through the CDN
      "Cache-Control": photo ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800" : "public, max-age=300, s-maxage=3600",
    },
  });
}
