/**
 * Qloo's cost text for a venue, parsed without guessing. Pure, so the server and
 * the browser format it the same way and tests can pin it down.
 *
 * Qloo writes ranges ("₹400 to ₹1600"), open-ended floors ("₹2000 or above",
 * "$100+") and plain words ("Expensive"). We never invent a ceiling for an
 * open-ended price, and words stay words.
 */

export type Cost = { costText?: string; costFrom?: number; costTo?: number; costOpen?: boolean; currency?: string };

export const SYM: Record<string, string> = { inr: "₹", usd: "$", gbp: "£", eur: "€", jpy: "¥", aud: "A$", cad: "C$", sgd: "S$", aed: "AED " };

const KNOWN = new Set([...Object.values(SYM).map((v) => v.trim()), "Rs", "Rs.", "INR", "USD", "GBP", "EUR"]);

const OPEN = /(or|and)\s+(above|more|over|up)|\+\s*$|\bfrom\b|\bover\b|\bat least\b/i;

export function parseCost(text: string | undefined): Cost {
  if (!text) return {};
  const t = text.trim();
  const nums = [...t.replace(/,/g, "").matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
  const currency = t.match(/^[^\d\s]+/)?.[0];
  // a prefix we do not recognise as money ("L1 to l10") is shown as Qloo wrote it, never converted
  if (!nums.length || (currency && !KNOWN.has(currency.trim()))) return { costText: t };
  if (OPEN.test(t) && nums.length === 1) return { costText: t, costFrom: nums[0], costOpen: true, currency };
  return { costText: t, costFrom: nums[0], costTo: nums[1] ?? nums[0], currency };
}

export const money = (n: number, sym = "") => `${sym}${n.toLocaleString(sym === "₹" ? "en-IN" : "en-US")}`;

/** What the price stat shows: "₹600 to ₹1,800", "₹2,000+", "$40", or Qloo's own words. */
export function costLabel(c: Cost | undefined) {
  if (!c?.costFrom) return c?.costText;
  if (c.costOpen) return `${money(c.costFrom, c.currency)}+`;
  return c.costTo && c.costTo !== c.costFrom ? `${money(c.costFrom, c.currency)} to ${money(c.costTo, c.currency)}` : money(c.costFrom, c.currency);
}

/** The table estimate, only when Qloo gave a number. It is labelled as ours because Qloo does not say the range is per person. */
export function tableEstimate(c: Cost | undefined, people: number) {
  if (!c?.costFrom || people < 2) return undefined;
  const lo = money(c.costFrom * people, c.currency);
  if (c.costOpen) return `From ${lo} for ${people} if that is per person, our estimate`;
  const hi = c.costTo && c.costTo !== c.costFrom ? ` to ${money(c.costTo * people, c.currency)}` : "";
  return `About ${lo}${hi} for ${people} if that is per person, our estimate`;
}
