"use client";

import { useEffect, useState } from "react";
import type { Hours, PlaceDetails } from "@/lib/agent";
import { Glyph } from "./art";
import p from "./place.module.css";
import { costLabel, tableEstimate } from "@/lib/cost";

/* ------------------------------------------------------------------ */
/* Everything a person needs before they actually go: rating, price,  */
/* hours, distance, booking and access facts. All of it comes from    */
/* Qloo's place data; the only arithmetic is the table estimate and   */
/* the straight-line distance, and both are labelled as such.         */
/* ------------------------------------------------------------------ */

/** the parts of a pick this band needs */
export type Pick = {
  name: string;
  address?: string;
  rating?: number;
  priceLevel?: number | null;
  lat?: number;
  lon?: number;
  details?: PlaceDetails;
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

// venues are read in their own clock where the country has one time zone
const TZ: Record<string, string> = {
  IN: "Asia/Kolkata", GB: "Europe/London", IE: "Europe/Dublin", FR: "Europe/Paris", DE: "Europe/Berlin", IT: "Europe/Rome",
  NL: "Europe/Amsterdam", BE: "Europe/Brussels", CH: "Europe/Zurich", AT: "Europe/Vienna", SE: "Europe/Stockholm",
  JP: "Asia/Tokyo", KR: "Asia/Seoul", SG: "Asia/Singapore", AE: "Asia/Dubai", HK: "Asia/Hong_Kong", TH: "Asia/Bangkok",
  NZ: "Pacific/Auckland", ZA: "Africa/Johannesburg", IL: "Asia/Jerusalem", PH: "Asia/Manila", LK: "Asia/Colombo",
};

const toMin = (t?: string) => {
  const m = t?.match(/T?(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

const clock = (t?: string) => {
  const m = toMin(t);
  if (m === undefined) return "";
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
};

function nowIn(country?: string) {
  const tz = country ? TZ[country] : undefined;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return { day: get("weekday").toLowerCase() as (typeof DAYS)[number], min: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function openState(hours: Hours | undefined, country?: string) {
  if (!hours) return null;
  const { day, min } = nowIn(country);
  const today = hours[day] ?? [];
  if (!today.length) return null;
  if (today.every((s) => s.closed)) return { open: false, text: "Closed today" };
  for (const s of today) {
    const o = toMin(s.opens), c0 = toMin(s.closes);
    if (o === undefined || c0 === undefined) continue;
    const c = c0 <= o ? c0 + 24 * 60 : c0; // past midnight
    if (min >= o && min < c) return { open: true, text: `Open now, closes ${clock(s.closes)}` };
    if (min < o) return { open: false, text: `Opens ${clock(s.opens)} today` };
  }
  return { open: false, text: "Closed for today" };
}

const km = (m: number) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 9500 ? 1 : 0)} km`);

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const costLine = (pick: Pick) => costLabel(pick.details);

export type Here = { lat: number; lon: number } | null;

export function distanceLine(pick: Pick, here: Here, city: string): { value: string; note: string; inside?: boolean } | null {
  if (here && pick.lat != null && pick.lon != null) return { value: km(haversine(here, { lat: pick.lat, lon: pick.lon })), note: "from you, as the crow flies" };
  const area = city.split(",")[0];
  // Qloo reports 0 for venues inside the area searched, which is not a real distance
  if (pick.details?.distanceM != null && pick.details.distanceM >= 50) return { value: km(pick.details.distanceM), note: `from the centre of ${area}` };
  if (pick.details?.distanceM != null) return { value: "In the area", note: `inside ${area}, the area you searched`, inside: true };
  return null;
}

export function directionsUrl(pick: Pick, here: Here) {
  const dest = pick.lat != null && pick.lon != null ? `${pick.lat},${pick.lon}` : [pick.name, pick.address].filter(Boolean).join(", ");
  const q = new URLSearchParams({ api: "1", destination: dest });
  if (here) q.set("origin", `${here.lat},${here.lon}`);
  return `https://www.google.com/maps/dir/?${q}`;
}

/* ---------------------------- the band ---------------------------- */

export function PlaceFacts({
  pick,
  people,
  city,
  here,
}: {
  pick: Pick;
  people: number;
  city: string;
  here: Here;
}) {
  const d = pick.details;
  const [state, setState] = useState<ReturnType<typeof openState>>(null);
  const [showHours, setShowHours] = useState(false);
  // the clock is read after mount so the server render and the first client render agree
  useEffect(() => {
    const tick = () => setState(openState(d?.hours, d?.country));
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [d?.hours, d?.country]);

  const cost = costLine(pick);
  const dist = distanceLine(pick, here, city);
  const today = nowIn(d?.country).day;

  return (
    <section className={p.band} aria-label="Before you go">
      <div className={p.stat} style={{ ["--c" as string]: "var(--yellow)" }}>
        <Glyph shape="circle" color="var(--ink)" size={18} />
        <span className={p.label}>Rating</span>
        <span className={p.value}>{pick.rating != null ? `${pick.rating.toFixed(1)}` : "None yet"}</span>
        {pick.rating != null && (
          <span className={p.stars} aria-label={`${pick.rating} out of 5`}>
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} style={{ ["--f" as string]: `${Math.max(0, Math.min(1, pick.rating! - i)) * 100}%` }} />
            ))}
          </span>
        )}
        <span className={p.note}>venue rating in Qloo</span>
      </div>

      <div className={p.stat} style={{ ["--c" as string]: "var(--pink)" }}>
        <Glyph shape="square" color="var(--ink)" size={18} />
        <span className={p.label}>Price range</span>
        <span className={p.value}>{cost ?? (pick.priceLevel ? (d?.country === "IN" ? "₹" : "$").repeat(Math.min(4, pick.priceLevel)) : "Not listed")}</span>
        <span className={p.note}>
          {tableEstimate(d, people) ??
            (pick.priceLevel
              ? `price level ${pick.priceLevel} of 4`
              : d?.costText
                ? "as Qloo describes it"
                : "ask when you book")}
        </span>
      </div>

      <div className={p.stat} style={{ ["--c" as string]: state?.open ? "var(--green)" : "var(--bone-2)", ["--on" as string]: state?.open ? "var(--paper)" : "var(--ink)" }}>
        <Glyph shape="arch" color={state?.open ? "var(--paper)" : "var(--ink)"} size={18} />
        <span className={p.label}>Today</span>
        <span className={p.value} data-small>{state?.text ?? (d?.hours ? "Checking" : "Hours not listed")}</span>
        {d?.hours && (
          <button type="button" className={p.link} onClick={() => setShowHours((x) => !x)} aria-expanded={showHours}>
            {showHours ? "Hide the week" : "The whole week"}
          </button>
        )}
      </div>

      <div className={p.stat} style={{ ["--c" as string]: "var(--blue)", ["--on" as string]: "var(--paper)" }}>
        <Glyph shape="drop" color="var(--paper)" size={18} />
        <span className={p.label}>Distance</span>
        <span className={p.value} data-small={dist?.inside || undefined}>{dist?.value ?? "Unknown"}</span>
        <span className={p.note}>{dist?.note ?? "no location in Qloo"}</span>
      </div>

      {showHours && d?.hours && (
        <ul className={p.week}>
          {[...DAYS.slice(1), DAYS[0]].map((day) => {
            const slots = d.hours?.[day] ?? [];
            return (
              <li key={day} data-today={day === today}>
                <span>{day.slice(0, 3)}</span>
                <span>
                  {!slots.length
                    ? "Not listed"
                    : slots.every((x) => x.closed)
                      ? "Closed"
                      : slots
                          .filter((x) => !x.closed)
                          .map((x) => `${clock(x.opens)} to ${clock(x.closes)}`)
                          .join(", ")}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {!!d?.facts?.length && (
        <div className={p.facts}>
          <span className={p.factsHead}>Good to know</span>
          <ul>
            {d.facts.map((f) => (
              <li key={f.label} data-kind={f.kind}>
                {f.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!!d?.reviewWords?.length && (
        <div className={p.facts}>
          <span className={p.factsHead}>Reviews keep mentioning</span>
          <span className={p.factsNote}>keyword counts from reviews Qloo has read</span>
          <ul>
            {d.reviewWords.map((w) => (
              <li key={w.name} data-kind="review">
                {w.name} <b>{w.count}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* --------------------------- the actions -------------------------- */

export function PlaceActions({
  pick,
  here,
  onHere,
  shareText,
}: {
  pick: Pick;
  here: Here;
  onHere: (h: Here) => void;
  shareText: string;
}) {
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [shared, setShared] = useState<string | null>(null);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setLocNote("This browser can't share a location.");
      return;
    }
    setLocating(true);
    setLocNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onHere({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setLocNote("Location wasn't shared, so distance is from the area's centre.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `Sapor picked ${pick.name}`, text: shareText });
        setShared("Sent");
      } else {
        await navigator.clipboard.writeText(shareText);
        setShared("Copied, paste it in the group");
      }
    } catch {
      /* the share sheet was dismissed */
    }
    setTimeout(() => setShared(null), 3500);
  };

  return (
    <div className={p.actions}>
      <a href={directionsUrl(pick, here)} target="_blank" rel="noreferrer" className={p.go}>
        Directions
      </a>
      {pick.details?.phone && (
        <a href={`tel:${pick.details.phone.replace(/\s+/g, "")}`} className={p.btn}>
          Call
        </a>
      )}
      <button type="button" className={p.btn} onClick={share}>
        {shared ?? "Send to the group"}
      </button>
      {!here && (
        <button type="button" className={p.btn} onClick={locate} disabled={locating}>
          {locating ? "Finding you" : "Distance from me"}
        </button>
      )}
      {(pick.details?.menuUrl || pick.details?.website) && (
        <a href={pick.details.menuUrl ?? pick.details.website} target="_blank" rel="noreferrer" className={p.btn}>
          {pick.details.menuUrl ? "Full menu" : "Website"}
        </a>
      )}
      {locNote && <p className={p.small}>{locNote}</p>}
      {here && <p className={p.small}>Your location stays on this device. It is only used to measure the distance.</p>}
    </div>
  );
}
