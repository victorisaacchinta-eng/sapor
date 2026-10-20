/**
 * Image relay for Qloo's image CDN only. Keeps hotlinking predictable, adds a
 * long cache, and refuses every other host so it can't be used as an open proxy.
 */
export const maxDuration = 15;

const ALLOWED = /^https:\/\/images\.qloo\.com\/i\/[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$/;

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") ?? "";
  if (!ALLOWED.test(u)) return new Response("Not allowed", { status: 400 });
  try {
    const r = await fetch(u, { headers: { Accept: "image/*" } });
    if (!r.ok || !r.body) return new Response("Not found", { status: 404 });
    const type = r.headers.get("content-type") ?? "image/jpeg";
    if (!type.startsWith("image/")) return new Response("Not an image", { status: 415 });
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > 4_000_000) return new Response("Too large", { status: 413 });
    return new Response(r.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      },
    });
  } catch {
    return new Response("Upstream error", { status: 502 });
  }
}
