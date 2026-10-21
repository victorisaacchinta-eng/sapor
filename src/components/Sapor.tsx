"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import s from "./sapor.module.css";
import { Glyph, hash, makeMosaic, Mosaic, seat, SHAPE_RADIUS, tableMosaic, Tile } from "./art";
import { FortuneBadge, Intro, Ticker, WorkingQuip } from "./Flavour";
import SmoothScroll from "./SmoothScroll";
import { costLine, directionsUrl, distanceLine, PlaceActions, PlaceFacts, type Here } from "./PlaceFacts";
import pf from "./place.module.css";
import { isAlcohol, isVeg } from "@/lib/dishes";
import type { PlaceDetails } from "@/lib/agent";

/* ------------------------------------------------------------------ */
/* Types mirrored from the server                                      */
/* ------------------------------------------------------------------ */

type Candidate = { id: string; name: string; kind: string; year?: number; blurb?: string; image?: string; popularity: number };
type Resolution =
  | { input: string; status: "resolved"; chosen: Candidate; alternatives: Candidate[] }
  | { input: string; status: "ambiguous"; options: Candidate[] }
  | { input: string; status: "not_found" };

type Love = {
  uid: string;
  text: string;
  status: "pending" | "resolved" | "ambiguous" | "not_found" | "error";
  chosen?: Candidate;
  options?: Candidate[];
};
type Seat = { uid: string; name: string; veg: boolean; loves: Love[]; draft: string };

type Occasion = "coffee" | "meal" | "dessert";
type Step = { type: "step"; id: string; label: string; detail?: string; status: "running" | "done" | "warn" };
type FriendFit = {
  key: string;
  fit: number;
  tagFit: number;
  share: number;
  matched: { name: string; kind: "cuisine" | "ambience"; affinity: number }[];
  vegNote?: "veg_friendly" | "few_veg" | "no_veg";
  order?: { dish: string; matchedCuisine?: string; keyword?: string; kind: "taste_match" | "house_favourite"; shared?: boolean };
};
type Pick = {
  id: string;
  name: string;
  area?: string;
  address?: string;
  image?: string;
  rating?: number;
  priceLevel?: number | null;
  lat?: number;
  lon?: number;
  details?: PlaceDetails;
  qlooAffinity: number;
  tableScore: number;
  fairness: number;
  friends: FriendFit[];
  vibe: string[];
  cuisines: string[];
  menu: string[];
};
type TasteWeight = { id: string; name: string; affinity: number };
type Result = {
  type: "result";
  occasion: Occasion;
  city: string;
  venueLabel: string;
  profiles: { key: string; cuisines: TasteWeight[]; ambience: TasteWeight[] }[];
  sharedTaste: TasteWeight[];
  picks: Pick[];
  relaxations: string[];
  considered: number;
  rejected: { name: string; reason: string }[];
  qloo: { calls: number; cached: number };
};
type Narration = { id: string; headline: string; why: string; lines: Record<string, string>; via: string };
type Diner = { key: string; name: string; index: number; loves: Candidate[]; veg: boolean };

type Run =
  | { state: "idle" }
  | { state: "running"; steps: Step[]; diners: Diner[] }
  | { state: "done"; steps: Step[]; diners: Diner[]; result: Result; narration: Record<string, Narration> }
  | { state: "error"; steps: Step[]; diners: Diner[]; message: string };

/* ------------------------------------------------------------------ */

let seq = 0;
const uid = () => `u${(seq += 1)}`;

const KIND_LABEL: Record<string, string> = {
  artist: "Music",
  movie: "Film",
  tv_show: "TV show",
  book: "Book",
  podcast: "Podcast",
  videogame: "Game",
};
const ASK_LABEL: Record<string, string> = {
  artist: "The music act",
  movie: "The film",
  tv_show: "The show",
  book: "The book",
  podcast: "The podcast",
  videogame: "The game",
};
const OCCASIONS: { id: Occasion; label: string; art: string; shape: "circle" | "arch" | "square" }[] = [
  { id: "coffee", label: "Coffee", art: "cappuccino", shape: "circle" },
  { id: "meal", label: "A meal", art: "chicken biryani", shape: "arch" },
  { id: "dessert", label: "Dessert", art: "cheesecake", shape: "square" },
];
const PLACES = ["Jubilee Hills, Hyderabad", "Banjara Hills, Hyderabad", "Gachibowli, Hyderabad", "Indiranagar, Bengaluru", "Bandra, Mumbai", "Brooklyn, New York"];

/** Route Qloo images through our relay, asking Qloo for a width that suits where the image is shown. */
const img = (u?: string, w = 240) => (u ? `/api/img?u=${encodeURIComponent(u.replace(/-\d+x-(auto|outside)/, `-${w}x-$1`))}` : undefined);
const qimg = (id: string) => `https://images.qloo.com/i/${id}-420x-auto.jpg`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** how many of the venue's reviews name this dish, from Qloo's review keywords */
const reviewMentions = (pick: Pick, dish?: string) => {
  if (!dish) return 0;
  const d = dish.toLowerCase();
  const hit = pick.details?.reviewWords?.find((w) => {
    const n = w.name.toLowerCase();
    return n.length > 4 && (n === d || d.includes(n) || n.includes(d));
  });
  return hit?.count ?? 0;
};

const emptySeat = (): Seat => ({ uid: uid(), name: "", veg: false, loves: [], draft: "" });
const resolvedLove = (c: Candidate): Love => ({ uid: uid(), text: c.name, status: "resolved", chosen: c });

/** Entities resolved live from Qloo on 21 Oct 2026, so the sample needs no lookups. */
const SAMPLE: Seat[] = [
  {
    uid: uid(),
    name: "Riya",
    veg: false,
    draft: "",
    loves: [
      resolvedLove({ id: "F347D506-CB6F-46FA-9A8B-AFBC31C71A1A", name: "BTS", kind: "artist", popularity: 0.996, image: qimg("F347D506-CB6F-46FA-9A8B-AFBC31C71A1A") }),
      resolvedLove({ id: "340C4A42-8726-42C9-BFA6-FBA6F923E5E6", name: "Squid Game", kind: "tv_show", year: 2021, popularity: 0.99, image: qimg("340C4A42-8726-42C9-BFA6-FBA6F923E5E6") }),
    ],
  },
  {
    uid: uid(),
    name: "Arjun",
    veg: true,
    draft: "",
    loves: [
      resolvedLove({ id: "9986F595-C20E-4EBB-828F-55E7DEEBE448", name: "A.R. Rahman", kind: "artist", popularity: 0.99, image: qimg("9986F595-C20E-4EBB-828F-55E7DEEBE448") }),
      resolvedLove({ id: "D2AD70AF-0750-4202-8AD2-E57C4C616631", name: "Pushpa: The Rise", kind: "movie", year: 2021, popularity: 0.98, image: qimg("D2AD70AF-0750-4202-8AD2-E57C4C616631") }),
    ],
  },
  {
    uid: uid(),
    name: "Meera",
    veg: false,
    draft: "",
    loves: [
      resolvedLove({ id: "871AE4FF-0D03-45CE-A6E1-B255607FA3DD", name: "Prateek Kuhad", kind: "artist", popularity: 0.97, image: qimg("871AE4FF-0D03-45CE-A6E1-B255607FA3DD") }),
      resolvedLove({ id: "EDA54D37-08C7-457D-83F8-1BCE21FEDC63", name: "Before Sunrise", kind: "movie", year: 1995, popularity: 0.98, image: qimg("EDA54D37-08C7-457D-83F8-1BCE21FEDC63") }),
    ],
  },
];

const HERO_TILES = makeMosaic(20261021, 20);
/** Hero tiles that show a real dish photo (looked up once, cached at the edge). */
const HERO_DISHES: Record<number, string> = {
  2: "bao bun",
  5: "pav bhaji",
  9: "masala chai",
  13: "masala dosa",
  16: "cappuccino",
  19: "tiramisu",
};

/* ------------------------------------------------------------------ */

export default function Sapor() {
  const [seats, setSeats] = useState<Seat[]>([emptySeat(), emptySeat()]);
  const [occasion, setOccasion] = useState<Occasion>("coffee");
  const [city, setCity] = useState("Jubilee Hills, Hyderabad");
  const [run, setRun] = useState<Run>({ state: "idle" });
  const [active, setActive] = useState(0);
  const [typing, setTyping] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [parseNote, setParseNote] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const resultRef = useRef<HTMLElement>(null);
  const tableRef = useRef<HTMLElement>(null);

  const updateSeat = useCallback((id: string, fn: (s: Seat) => Seat) => {
    setSeats((prev) => prev.map((x) => (x.uid === id ? fn(x) : x)));
  }, []);

  const updateLove = useCallback((seatId: string, loveId: string, fn: (l: Love) => Love) => {
    setSeats((prev) =>
      prev.map((x) => (x.uid === seatId ? { ...x, loves: x.loves.map((l) => (l.uid === loveId ? fn(l) : l)) } : x)),
    );
  }, []);

  const resolve = useCallback(
    async (items: { seatId: string; loveId: string; text: string }[]) => {
      if (!items.length) return;
      try {
        const res = await fetch("/api/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ loves: items.map((i) => i.text) }),
        });
        const data = (await res.json()) as { results?: Resolution[]; error?: string };
        if (!res.ok || !data.results) throw new Error(data.error ?? "lookup failed");
        const byInput = new Map(data.results.map((r) => [r.input, r]));
        for (const it of items) {
          const r = byInput.get(it.text.trim());
          updateLove(it.seatId, it.loveId, (l) => {
            if (!r) return { ...l, status: "error" };
            if (r.status === "resolved") return { ...l, status: "resolved", chosen: r.chosen };
            if (r.status === "ambiguous") return { ...l, status: "ambiguous", options: r.options };
            return { ...l, status: "not_found" };
          });
        }
      } catch {
        for (const it of items) updateLove(it.seatId, it.loveId, (l) => ({ ...l, status: "error" }));
      }
    },
    [updateLove],
  );

  const addLove = (seat: Seat) => {
    const text = seat.draft.trim();
    if (!text || seat.loves.length >= 3) return;
    const love: Love = { uid: uid(), text, status: "pending" };
    updateSeat(seat.uid, (x) => ({ ...x, draft: "", loves: [...x.loves, love] }));
    void resolve([{ seatId: seat.uid, loveId: love.uid, text }]);
  };

  const loadSample = () => {
    setSeats(SAMPLE.map((x) => ({ ...x, uid: uid(), loves: x.loves.map((l) => ({ ...l, uid: uid() })) })));
    setCity("Jubilee Hills, Hyderabad");
    setOccasion("coffee");
    setTyping(false);
    requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const parseFreeText = async () => {
    if (!freeText.trim()) return;
    setParsing(true);
    setParseNote(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: freeText }),
      });
      const data = (await res.json()) as { friends?: { name: string; loves: string[] }[]; error?: string };
      if (!res.ok || !data.friends?.length) {
        setParseNote(data.error ?? "Sapor couldn't find people and their loves in that. Try: Riya loves BTS and Squid Game. Arjun loves Pushpa.");
        return;
      }
      const next: Seat[] = data.friends.map((f) => ({
        uid: uid(),
        name: f.name,
        veg: false,
        draft: "",
        loves: f.loves.slice(0, 3).map((t) => ({ uid: uid(), text: t, status: "pending" as const })),
      }));
      setSeats(next);
      setTyping(false);
      void resolve(next.flatMap((x) => x.loves.map((l) => ({ seatId: x.uid, loveId: l.uid, text: l.text }))));
    } finally {
      setParsing(false);
    }
  };

  const ready = useMemo(() => {
    const filled = seats.filter((x) => x.loves.some((l) => l.status === "resolved"));
    const waiting = seats.some((x) => x.loves.some((l) => l.status === "pending" || l.status === "ambiguous"));
    return { filled, waiting, ok: filled.length >= 1 && !waiting && city.trim().length > 1 };
  }, [seats, city]);

  const go = async () => {
    if (!ready.ok) return;
    const included = ready.filled.slice(0, 6);
    const diners: Diner[] = included.map((x, i) => ({
      key: String.fromCharCode(65 + i),
      name: x.name.trim() || `Guest ${seats.indexOf(x) + 1}`,
      index: seats.indexOf(x),
      veg: x.veg,
      loves: x.loves.filter((l) => l.status === "resolved" && l.chosen).map((l) => l.chosen!),
    }));
    const body = {
      city: city.trim(),
      occasion,
      friends: diners.map((d) => ({ veg: d.veg, loves: d.loves.map((c) => ({ id: c.id, name: c.name, kind: c.kind })) })),
    };
    setActive(0);
    setRun({ state: "running", steps: [], diners });
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));

    const steps: Step[] = [];
    const upsert = (st: Step) => {
      const i = steps.findIndex((x) => x.id === st.id);
      if (i >= 0) steps[i] = st;
      else steps.push(st);
    };
    let result: Result | undefined;
    const narration: Record<string, Narration> = {};
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "Sapor couldn't reach the planner. Try again.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "step") {
            upsert(ev);
            setRun({ state: "running", steps: [...steps], diners });
          } else if (ev.type === "result") {
            result = ev;
          } else if (ev.type === "narration") {
            for (const it of ev.items as Narration[]) narration[it.id] = it;
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
      if (!result) throw new Error("The planner stopped early. Try again.");
      setRun({ state: "done", steps: [...steps], diners, result, narration });
    } catch (e) {
      setRun({ state: "error", steps: [...steps], diners, message: (e as Error).message });
    }
  };

  /* ---------------------------------------------------------------- */

  return (
    <div className={s.page}>
      <SmoothScroll />
      <Intro />
      <FortuneBadge />
      <header className={s.masthead}>
        <a href="#top" className={s.wordmark} aria-label="Sapor home">
          Sap
          <span className={s.wordO} aria-hidden>
            <Glyph shape="circle" color="var(--red)" size={30} />
          </span>
          r
        </a>
        <nav className={s.nav}>
          <a href="#how">How it decides</a>
          <button type="button" onClick={loadSample}>
            Try a sample table
          </button>
        </nav>
      </header>

      <section className={s.hero} id="top">
        <div className={s.heroCopy}>
          <h1 className={s.h1}>Where should we go?</h1>
          <p className={s.lede}>
            Everyone names a film, show or artist they love. Sapor reads the taste behind them with Qloo and picks a
            place that suits the whole table, down to what each of you should order.
          </p>
          <div className={s.heroCtas}>
            <a href="#table" className={s.btnPrimary}>
              Seat your table
            </a>
            <button type="button" className={s.btnGhost} onClick={loadSample}>
              Try a sample table
            </button>
          </div>
          <p className={s.gloss}>
            <span>Sapor</span> is Latin for taste. Savour the same place.
          </p>
        </div>
        <div className={s.heroArt} aria-hidden>
          <div className={s.heroGrid}>
            {HERO_TILES.map((t, i) => (
              <div key={i} className={s.heroTile} style={{ ["--d" as string]: `${t.delay}ms` }}>
                {HERO_DISHES[i] ? <PhotoTile dish={HERO_DISHES[i]} fallback={<Tile {...t} />} /> : <Tile {...t} />}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={s.tableSection} id="table" ref={tableRef} aria-labelledby="table-h">
        <div className={s.sectionHead}>
          <h2 id="table-h" className={s.h2}>
            Your table
          </h2>
          <div className={s.sectionTools}>
            <button type="button" className={s.link} onClick={() => setTyping((t) => !t)} aria-expanded={typing}>
              {typing ? "Back to seats" : "Type it out instead"}
            </button>
            <button type="button" className={s.link} onClick={loadSample}>
              Fill a sample table
            </button>
          </div>
        </div>

        {typing ? (
          <div className={s.freeText}>
            <label htmlFor="free" className={s.label}>
              Who is coming, and what do they love?
            </label>
            <textarea
              id="free"
              className={s.textarea}
              rows={4}
              maxLength={800}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Riya is all BTS and Squid Game. Arjun loves A. R. Rahman and Pushpa. Meera can't stop playing Prateek Kuhad."
            />
            <div className={s.row}>
              <button type="button" className={s.btnPrimary} onClick={parseFreeText} disabled={parsing || !freeText.trim()}>
                {parsing ? "Reading it" : "Fill in the seats"}
              </button>
              {parseNote && <p className={s.note}>{parseNote}</p>}
            </div>
          </div>
        ) : (
          <ol className={s.seats}>
            {seats.map((st, i) => (
              <SeatCard
                key={st.uid}
                seat={st}
                index={i}
                canRemove={seats.length > 1}
                onName={(v) => updateSeat(st.uid, (x) => ({ ...x, name: v }))}
                onVeg={(v) => updateSeat(st.uid, (x) => ({ ...x, veg: v }))}
                onDraft={(v) => updateSeat(st.uid, (x) => ({ ...x, draft: v }))}
                onAdd={() => addLove(st)}
                onRemove={() => setSeats((p) => p.filter((x) => x.uid !== st.uid))}
                onRemoveLove={(id) => updateSeat(st.uid, (x) => ({ ...x, loves: x.loves.filter((y) => y.uid !== id) }))}
                onChoose={(id, c) => updateLove(st.uid, id, (x) => ({ ...x, status: "resolved", chosen: c }))}
              />
            ))}
            {seats.length < 6 && (
              <li className={s.addSeat}>
                <button type="button" onClick={() => setSeats((p) => [...p, emptySeat()])}>
                  <Glyph shape={seat(seats.length).shape} color={seat(seats.length).color} size={56} />
                  <span>Pull up a chair</span>
                </button>
              </li>
            )}
          </ol>
        )}

        <div className={s.planBar}>
          <fieldset className={s.occasions}>
            <legend className={s.label}>What for</legend>
            <div className={s.occasionRow}>
              {OCCASIONS.map((o, i) => (
                <label key={o.id} className={s.occasion} data-on={occasion === o.id}>
                  <input type="radio" name="occasion" value={o.id} checked={occasion === o.id} onChange={() => setOccasion(o.id)} />
                  <span className={s.occasionPic} style={{ borderRadius: SHAPE_RADIUS[o.shape] }} aria-hidden>
                    <PhotoTile dish={o.art} fallback={<Glyph shape={o.shape} color={["var(--red)", "var(--green)", "var(--blue)"][i]} size={30} />} />
                  </span>
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={s.where}>
            <label htmlFor="where" className={s.label}>
              Where
            </label>
            <input
              id="where"
              className={s.whereInput}
              value={city}
              maxLength={60}
              list="places"
              onChange={(e) => setCity(e.target.value)}
              placeholder="A neighbourhood and city"
            />
            <datalist id="places">
              {PLACES.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div className={s.goWrap}>
            <button type="button" className={s.btnGo} onClick={go} disabled={!ready.ok || run.state === "running"}>
              {run.state === "running" ? "Reading the table" : "Pick our place"}
            </button>
            <p className={s.goHint} aria-live="polite">
              {ready.waiting
                ? "Answer the question in the seats first."
                : ready.filled.length === 0
                  ? "Add at least one love to a seat."
                  : `${ready.filled.length} at the table. Names stay on this device.`}
            </p>
          </div>
        </div>
      </section>

      <Ticker />

      <section className={s.resultSection} ref={resultRef} aria-live="polite" aria-label="Sapor's pick">
        {run.state !== "idle" && <Output run={run} active={active} setActive={setActive} />}
      </section>

      <HowItDecides />

      <footer className={s.footer}>
        <div className={s.footInner}>
          <p className={s.footMark}>
            Sap
            <span className={s.wordO} aria-hidden>
              <Glyph shape="circle" color="var(--red)" size={22} />
            </span>
            r
          </p>
          <p>
            Taste data, venues, tags, menu highlights and images come from Qloo&rsquo;s taste graph. Qloo describes what
            people with similar taste tend to like, not what any one person will do. Food photos come from{" "}
            <a href="https://unsplash.com/?utm_source=sapor&utm_medium=referral" target="_blank" rel="noreferrer">
              Unsplash
            </a>{" "}
            and are credited to each photographer. Dish-to-cuisine matching and the illustrations are Sapor&rsquo;s own.
          </p>
          <p>Built by Victor Isaac for the Qloo Agentic Hackathon, 2026. Open source under MIT. Savour the same place.</p>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Real food photos (Pexels, via our server)                           */
/* ------------------------------------------------------------------ */

type DishPhotoData = {
  src: string;
  srcWide: string;
  alt: string;
  avgColor?: string;
  photographer: string;
  photographerUrl: string;
  photoUrl: string;
  source: "Unsplash" | "Pexels";
  match: "exact" | "similar";
  anchor: string;
};

const photoRequests = new Map<string, Promise<DishPhotoData | null>>();
function loadPhoto(dish: string) {
  const k = dish.trim().toLowerCase();
  let p = photoRequests.get(k);
  if (!p) {
    p = fetch(`/api/dish-photo?d=${encodeURIComponent(dish)}`)
      .then((r) => (r.ok ? r.json() : { photo: null }))
      .then((j: { photo: DishPhotoData | null }) => j.photo)
      .catch(() => null);
    photoRequests.set(k, p);
  }
  return p;
}

function usePhoto(dish?: string) {
  const [state, setState] = useState<{ dish?: string; photo: DishPhotoData | null; done: boolean }>({ photo: null, done: false });
  useEffect(() => {
    if (!dish) return;
    let live = true;
    loadPhoto(dish).then((photo) => live && setState({ dish, photo, done: true }));
    return () => {
      live = false;
    };
  }, [dish]);
  return state.dish === dish ? state : { photo: null, done: !dish };
}

function DishPhoto({
  dish,
  shape,
  color,
  children,
}: {
  dish?: string;
  shape: keyof typeof SHAPE_RADIUS;
  color: string;
  children?: React.ReactNode;
}) {
  const { photo, done } = usePhoto(dish);
  const [loaded, setLoaded] = useState<string | null>(null);
  const radius = SHAPE_RADIUS[shape];
  return (
    <figure className={s.dishFigure}>
      <div className={s.dishFrame}>
        <span className={s.dishBlock} style={{ borderRadius: radius }} aria-hidden />
        <div
          className={s.dishPhoto}
          style={{ borderRadius: radius, background: photo?.avgColor ?? (done ? color : "var(--bone-2)") }}
          data-loading={!done || (photo && loaded !== photo.src) ? "true" : undefined}
          data-empty={done && !photo ? "true" : undefined}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.src} alt={photo.alt || dish || ""} loading="lazy" onLoad={() => setLoaded(photo.src)} data-ready={loaded === photo.src} />
          ) : done ? (
            <span className={s.dishType}>
              {dish ?? "Ask the staff"}
              <small>No photo good enough for this one</small>
            </span>
          ) : null}
        </div>
      </div>
      {children}
      {photo && (
        <figcaption className={s.credit}>
          {photo.match === "similar" ? `Shows ${photo.anchor}, a close match. ` : ""}
          Photo by{" "}
          <a href={photo.photographerUrl} target="_blank" rel="noreferrer">
            {photo.photographer}
          </a>{" "}
          on{" "}
          <a href={photo.photoUrl} target="_blank" rel="noreferrer">
            {photo.source}
          </a>
        </figcaption>
      )}
    </figure>
  );
}

function PhotoTile({ dish, fallback, wide }: { dish: string; fallback: React.ReactNode; wide?: boolean }) {
  const { photo, done } = usePhoto(dish);
  if (done && !photo) return <>{fallback}</>;
  return (
    <div className={s.photoTile} style={{ background: photo?.avgColor ?? "var(--bone-2)" }}>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={wide ? photo.srcWide : photo.src} alt="" loading="lazy" />
      )}
    </div>
  );
}

function Thumb({ src, shape, color, size = 52, alt }: { src?: string; shape: keyof typeof SHAPE_RADIUS; color: string; size?: number; alt: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, borderRadius: SHAPE_RADIUS[shape], ["--c" as string]: color };
  if (!src || failed) {
    return (
      <span className={s.thumb} style={style} aria-hidden>
        <Glyph shape={shape} color={color} size={size * 0.5} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={s.thumb} style={style} src={img(src)} alt={alt} width={size} height={size} loading="lazy" onError={() => setFailed(true)} />
  );
}

function SeatCard({
  seat: st,
  index,
  canRemove,
  onName,
  onVeg,
  onDraft,
  onAdd,
  onRemove,
  onRemoveLove,
  onChoose,
}: {
  seat: Seat;
  index: number;
  canRemove: boolean;
  onName: (v: string) => void;
  onVeg: (v: boolean) => void;
  onDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: () => void;
  onRemoveLove: (id: string) => void;
  onChoose: (id: string, c: Candidate) => void;
}) {
  const look = seat(index);
  return (
    <li className={s.seat} style={{ ["--c" as string]: look.color, ["--on" as string]: look.on }}>
      <div className={s.seatBand}>
        <Glyph shape={look.shape} color={look.on} size={26} />
        <input
          className={s.nameInput}
          value={st.name}
          maxLength={24}
          onChange={(e) => onName(e.target.value)}
          placeholder={`Guest ${index + 1}`}
          aria-label={`Seat ${index + 1} name`}
        />
        {canRemove && (
          <button type="button" className={s.seatRemove} onClick={onRemove} aria-label={`Remove ${st.name || `guest ${index + 1}`}`}>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2" />
            </svg>
          </button>
        )}
      </div>

      <ul className={s.loves}>
        {st.loves.map((l) => (
          <li key={l.uid} className={s.love} data-status={l.status}>
            {l.status === "resolved" && l.chosen && (
              <>
                <Thumb src={l.chosen.image} shape={look.shape} color={look.color} alt={l.chosen.name} />
                <span className={s.loveText}>
                  <span className={s.loveName}>{l.chosen.name}</span>
                  <span className={s.loveKind}>
                    {KIND_LABEL[l.chosen.kind] ?? l.chosen.kind}
                    {l.chosen.year ? `, ${l.chosen.year}` : ""}
                  </span>
                </span>
              </>
            )}
            {l.status === "pending" && (
              <>
                <span className={`${s.thumb} ${s.thumbPending}`} style={{ borderRadius: SHAPE_RADIUS[look.shape] }} aria-hidden />
                <span className={s.loveText}>
                  <span className={s.loveName}>{l.text}</span>
                  <span className={s.loveKind}>Looking it up</span>
                </span>
              </>
            )}
            {(l.status === "not_found" || l.status === "error") && (
              <span className={s.loveText}>
                <span className={s.loveName}>{l.text}</span>
                <span className={s.loveWarn}>
                  {l.status === "error" ? "Couldn't check this. Remove it and try again." : "Qloo doesn't know this one. Try the full title."}
                </span>
              </span>
            )}
            {l.status === "ambiguous" && l.options && (
              <div className={s.ask} role="group" aria-label={`Which ${l.text}?`}>
                <span className={s.askQ}>Which {l.text}?</span>
                <div className={s.askOpts}>
                  {l.options.map((o) => (
                    <button type="button" key={o.id} className={s.askOpt} onClick={() => onChoose(l.uid, o)}>
                      <Thumb src={o.image} shape="square" color={look.color} size={34} alt="" />
                      <span>
                        {ASK_LABEL[o.kind] ?? o.kind}
                        {o.year ? ` (${o.year})` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button type="button" className={s.loveX} onClick={() => onRemoveLove(l.uid)} aria-label={`Remove ${l.chosen?.name ?? l.text}`}>
              <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          </li>
        ))}
        {st.loves.length < 3 && (
          <li className={s.addLove}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onAdd();
              }}
            >
              <input
                className={s.loveInput}
                value={st.draft}
                maxLength={90}
                onChange={(e) => onDraft(e.target.value)}
                onBlur={() => st.draft.trim() && onAdd()}
                placeholder={st.loves.length ? "Something else they love" : "A film, show, artist or book"}
                aria-label={`Something ${st.name || `guest ${index + 1}`} loves`}
              />
              <button type="submit" className={s.addBtn} aria-label="Add" disabled={!st.draft.trim()}>
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            </form>
          </li>
        )}
      </ul>

      <label className={s.veg}>
        <input type="checkbox" checked={st.veg} onChange={(e) => onVeg(e.target.checked)} />
        <span>Vegetarian</span>
      </label>
    </li>
  );
}

/* ------------------------------------------------------------------ */

function Output({ run, active, setActive }: { run: Exclude<Run, { state: "idle" }>; active: number; setActive: (n: number) => void }) {
  return (
    <>
      {(run.state === "running" || run.state === "error") && <Working run={run} />}
      {run.state === "done" && run.result.picks.length === 0 && (
        <div className={s.empty}>
          <h2 className={s.h2}>The kitchen&rsquo;s closed here</h2>
          <p>
            Qloo has no {run.result.venueLabel}s with menu data for &ldquo;{run.result.city}&rdquo;. Try a nearby
            neighbourhood or a bigger city name.
          </p>
        </div>
      )}
      {run.state === "done" && run.result.picks.length > 0 && (
        <Pickboard result={run.result} diners={run.diners} narration={run.narration} steps={run.steps} active={active} setActive={setActive} />
      )}
    </>
  );
}

function Working({ run }: { run: Exclude<Run, { state: "idle" | "done" }> }) {
  const done = run.steps.filter((x) => x.status !== "running").length;
  const tiles = useMemo(() => tableMosaic(7, run.diners.map((d) => ({ color: seat(d.index).color, weight: 1 })), 24), [run.diners]);
  const named = (t: string) => t.replace(/\b([A-F]):/g, (m, k: string) => (run.diners.find((d) => d.key === k)?.name ?? k) + ":");
  return (
    <div className={s.working}>
      <div className={s.workMosaic} aria-hidden>
        {tiles.map((t, i) => (
          <div key={i} className={s.workTile} data-lit={i < done * 5 + 2} style={{ ["--d" as string]: `${(i % 6) * 60}ms` }}>
            <Tile {...t} />
          </div>
        ))}
      </div>
      <div>
        <h2 className={s.h2}>{run.state === "error" ? "Something stopped the agent" : "Sapor is reading your table"}</h2>
        {run.state === "running" && <WorkingQuip />}
        {run.state === "error" && <p className={s.errorMsg}>{run.message}</p>}
        <StepList steps={run.steps} named={named} running={run.state === "running"} />
      </div>
    </div>
  );
}

function StepList({ steps, named, running }: { steps: Step[]; named: (t: string) => string; running?: boolean }) {
  return (
    <ol className={s.steps}>
      {steps.map((st) => (
        <li key={st.id} className={s.step} data-status={st.status}>
          <span className={s.stepLabel}>{st.label}</span>
          {st.detail && <span className={s.stepDetail}>{named(st.detail)}</span>}
        </li>
      ))}
      {running && steps.length === 0 && (
        <li className={s.step} data-status="running">
          <span className={s.stepLabel}>Sending the table to Qloo</span>
        </li>
      )}
    </ol>
  );
}

function Pickboard({
  result,
  diners,
  narration,
  steps,
  active,
  setActive,
}: {
  result: Result;
  diners: Diner[];
  narration: Record<string, Narration>;
  steps: Step[];
  active: number;
  setActive: (n: number) => void;
}) {
  const pick = result.picks[Math.min(active, result.picks.length - 1)];
  const nar = narration[pick.id];
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId === pick.id;
  const dinerOf = (key: string) => diners.find((d) => d.key === key)!;
  const lowest = Math.min(...pick.friends.map((f) => f.fit));
  const avg = pick.friends.reduce((a, f) => a + f.fit, 0) / pick.friends.length;
  const lowestDiner = dinerOf(pick.friends.find((f) => f.fit === lowest)!.key);
  const tiles = tableMosaic(
    hash(pick.id),
    pick.friends.map((f) => ({ color: seat(dinerOf(f.key).index).color, weight: f.fit })),
    30,
  );
  const named = (t: string) =>
    t
      .replace(/\b([A-F]):/g, (m, k: string) => (diners.find((d) => d.key === k)?.name ?? k) + ":")
      .replace(/\b(?:friend|person|guest|diner|seat|member)\s+([A-F])\b/gi, (m, k: string) => diners.find((d) => d.key === k.toUpperCase())?.name ?? m);
  const [here, setHere] = useState<Here>(null);
  const ordered = new Set(pick.friends.map((f) => f.order?.dish).filter(Boolean) as string[]);
  const cost = costLine(pick);
  const shareText = [
    `Sapor picked ${pick.name}${pick.area ? `, ${pick.area}` : ""} for us.`,
    [pick.rating != null ? `Rated ${pick.rating.toFixed(1)}` : "", cost ? `price range ${cost}` : ""].filter(Boolean).join(", "),
    ...pick.friends.map((f) => `${dinerOf(f.key).name}: ${f.order?.dish ?? "ask the staff"}`),
    `Directions: ${directionsUrl(pick, null)}`,
    typeof window !== "undefined" ? `Plan yours: ${window.location.origin}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <article className={s.board} key={pick.id}>
      <div className={s.pickHero}>
        <div className={s.pickArt}>
          <Mosaic tiles={tiles} cols={6} className={s.pickMosaic} tileClass={s.pickTile} />
          {pick.image && (
            <div className={s.pickPhoto}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img(pick.image, 840)}
                alt={`${pick.name}, photo from Qloo`}
                onError={(e) => {
                  (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                }}
              />
            </div>
          )}
        </div>

        <div className={s.pickCopy}>
          <p className={s.pickMeta}>
            {result.occasion === "meal" ? "A meal" : result.occasion === "coffee" ? "Coffee" : "Dessert"} for {pick.friends.length}
            {pick.area ? ` in ${pick.area}` : ""}
          </p>
          <h2 className={s.venue}>{pick.name}</h2>
          {nar?.why && <p className={s.why}>{nar.why}</p>}
          <div className={s.fairness}>
            <div className={s.fairBar} aria-hidden>
              {pick.friends.map((f) => (
                <span key={f.key} style={{ flexGrow: f.fit, background: seat(dinerOf(f.key).index).color }} />
              ))}
            </div>
            <p>
              {pick.friends.length > 1
                ? `Weakest match is ${lowestDiner.name} at ${pct(lowest)}; the table averages ${pct(avg)}.`
                : `${lowestDiner.name}'s match is ${pct(lowest)}.`}
            </p>
            <p className={s.matchNote}>A match is how much of someone&rsquo;s Qloo taste profile this venue&rsquo;s own Qloo tags carry. It is not a prediction of how much they will enjoy it.</p>
          </div>
          <div className={s.pickActions}>
            <PlaceActions pick={pick} here={here} onHere={setHere} shareText={shareText} />
            <button type="button" className={s.btnGhost} aria-expanded={open} onClick={() => setOpenId(open ? null : pick.id)}>
              {open ? "Hide the evidence" : "Show the evidence"}
            </button>
          </div>
        </div>
      </div>

      <PlaceFacts pick={pick} people={pick.friends.length} city={result.city} here={here} />

      <ol className={s.orders}>
        {pick.friends.map((f, i) => {
          const d = dinerOf(f.key);
          const look = seat(d.index);
          return (
            <li key={f.key} className={s.order} style={{ ["--c" as string]: look.color, ["--on" as string]: look.on, ["--i" as string]: i }}>
              <div className={s.orderTop}>
                <Glyph shape={look.shape} color={look.on} size={20} />
                <span className={s.orderName}>{d.name}</span>
                <span className={s.orderFit}>{pct(f.fit)} match</span>
              </div>
              <div className={s.orderLoves}>
                {d.loves.slice(0, 3).map((c) => (
                  <Thumb key={c.id} src={c.image} shape={look.shape} color={look.color} size={46} alt={c.name} />
                ))}
                <span className={s.orderLovesText}>{d.loves.map((c) => c.name).join(" + ")}</span>
              </div>
              <DishPhoto dish={f.order?.dish} shape={look.shape} color={look.color}>
                <p className={s.dishName}>{f.order?.dish ?? "Ask the staff"}</p>
                <p className={s.dishKind} data-kind={f.order?.kind ?? "none"}>
                  {f.order?.kind === "taste_match"
                    ? `Matches their lean towards ${f.order.matchedCuisine}`
                    : f.order
                      ? "House favourite, not a taste match"
                      : "No highlight fits"}
                  {d.veg ? ", vegetarian by name, confirm with staff" : ""}
                  {f.order?.shared ? ". Same as someone else: the menu lists nothing else that fits" : ""}
                </p>
              </DishPhoto>
              {(() => {
                const said = reviewMentions(pick, f.order?.dish);
                return said ? (
                  <p className={s.orderSaid}>
                    <span aria-hidden>★</span> {said} review mention{said === 1 ? "" : "s"} at {pick.name}
                  </p>
                ) : null;
              })()}
              {nar?.lines?.[f.key] && <p className={s.orderWhy}>{named(nar.lines[f.key])}</p>}
              <div className={s.meter} aria-hidden>
                <span style={{ width: pct(f.fit) }} />
              </div>
            </li>
          );
        })}
      </ol>

      {pick.menu.length > 0 && (
        <section className={pf.menu} aria-label={`Menu highlights at ${pick.name}`}>
          <div className={pf.menuHead}>
            <h3>Menu highlights at {pick.name}</h3>
            <p>As listed in Qloo for this venue. Menus change, so check on arrival. Dark ones are on your table.</p>
          </div>
          <ul>
            {pick.menu.map((m) => (
              <li key={m} data-ordered={ordered.has(m)} data-veg={isVeg(m) && !isAlcohol(m)}>
                {m}
              </li>
            ))}
          </ul>
        </section>
      )}

      {open && <Evidence result={result} pick={pick} diners={diners} steps={steps} named={named} />}

      {result.picks.length > 1 && (
        <div className={s.others}>
          <h3 className={s.h3}>Also fits the table</h3>
          <ul>
            {result.picks.map((p, i) =>
              i === active ? null : (
                <li key={p.id}>
                  <button type="button" className={s.other} onClick={() => setActive(i)}>
                    <span className={s.otherImg}>
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img(p.image)} alt="" loading="lazy" />
                      ) : (
                        <Glyph shape="arch" color="var(--blue)" size={40} />
                      )}
                    </span>
                    <span className={s.otherText}>
                      <span className={s.otherName}>{p.name}</span>
                      <span className={s.otherMeta}>
                        {[
                          p.area,
                          p.rating != null ? `${p.rating.toFixed(1)}★` : "",
                          costLine(p) ?? "",
                          (() => {
                            const dl = distanceLine(p, here, result.city);
                            return dl && !dl.inside ? (here ? `${dl.value} from you` : `${dl.value} from the centre`) : "";
                          })(),
                          `weakest match ${pct(Math.min(...p.friends.map((f) => f.fit)))}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className={s.otherDishes} aria-hidden>
                      {p.friends.slice(0, 3).map((f) =>
                        f.order ? (
                          <span key={f.key} className={s.otherDish}>
                            <PhotoTile dish={f.order.dish} fallback={<Glyph shape="circle" color={seat(dinerOf(f.key).index).color} size={20} />} />
                          </span>
                        ) : null,
                      )}
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </article>
  );
}

function Evidence({
  result,
  pick,
  diners,
  steps,
  named,
}: {
  result: Result;
  pick: Pick;
  diners: Diner[];
  steps: Step[];
  named: (t: string) => string;
}) {
  return (
    <div className={s.evidence}>
      <div className={s.evIntro}>
        <h3 className={s.h3}>The evidence</h3>
        <p>
          Everything here came back from Qloo for this request. Affinities describe groups with similar taste, not a
          prediction about any one of you.
        </p>
        <StepList steps={steps} named={named} />
      </div>
      <dl className={s.evList}>
        {result.profiles.map((p) => {
          const f = pick.friends.find((x) => x.key === p.key)!;
          const d = diners.find((x) => x.key === p.key)!;
          return (
            <div key={p.key} className={s.evRow} style={{ ["--c" as string]: seat(d.index).color }}>
              <dt>{d.name}</dt>
              <dd>
                <p>
                  <b>Leans</b> {p.cuisines.slice(0, 4).map((t) => `${t.name} ${t.affinity.toFixed(2)}`).join(", ") || "no cuisine signal"}
                </p>
                <p>
                  <b>Rooms</b> {p.ambience.slice(0, 4).map((t) => `${t.name} ${t.affinity.toFixed(2)}`).join(", ") || "no ambience signal"}
                </p>
                <p>
                  <b>Matched here</b> {f.matched.map((m) => m.name).join(", ") || "nothing directly"}. Their loves drove{" "}
                  {pct(f.share)} of Qloo&rsquo;s score for this venue
                  {f.vegNote === "no_veg" ? "; nothing vegetarian on the highlights" : f.vegNote === "veg_friendly" ? "; tagged vegetarian-friendly" : ""}.
                </p>
              </dd>
            </div>
          );
        })}
        <div className={s.evRow}>
          <dt>The venue</dt>
          <dd>
            <p>
              <b>Qloo affinity</b> {pick.qlooAffinity.toFixed(3)}
            </p>
            <p>
              <b>Table score</b> {pick.tableScore.toFixed(3)}, which is 0.60 &times; the weakest match + 0.25 &times; the average match + 0.15 &times; Qloo&rsquo;s
              affinity for the venue. The person a venue suits least decides most of the ranking.
            </p>
            <p>
              <b>Dishes</b> come from this venue&rsquo;s Qloo menu highlights. Linking a dish to a cuisine is Sapor&rsquo;s own keyword map, not Qloo data.
            </p>
            {pick.vibe.length > 0 && (
              <p>
                <b>Room</b> {pick.vibe.join(", ")}
              </p>
            )}
            {pick.cuisines.length > 0 && (
              <p>
                <b>Cuisines</b> {pick.cuisines.join(", ")}
              </p>
            )}
            {pick.menu.length > 0 && (
              <p>
                <b>Menu highlights</b> {pick.menu.join(", ")}
              </p>
            )}
          </dd>
        </div>
        <div className={s.evRow}>
          <dt>The search</dt>
          <dd>
            <p>
              {result.considered} {result.venueLabel}s with menu data compared; {result.qloo.calls} new Qloo calls,{" "}
              {result.qloo.cached} answered from cache.
            </p>
            {result.rejected.length > 0 && (
              <p>
                <b>Set aside</b> {result.rejected.map((r) => r.name).join(", ")}: no cuisine or menu data, so possibly not
                food venues.
              </p>
            )}
            {result.relaxations.map((r) => (
              <p key={r}>{r}</p>
            ))}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function HowItDecides() {
  const steps = [
    {
      t: "It checks what you meant",
      p: "Each love is looked up in Qloo. When a name could be two things, like Dune the film and Dune the band, Sapor asks, because they draw different crowds.",
      shape: "circle" as const,
      c: "var(--yellow)",
      n: "var(--ink)",
    },
    {
      t: "It reads each person's taste",
      p: "Qloo returns the cuisines and rooms people who share those loves tend to favour. BTS and Squid Game fans lean Korean and like hip rooms.",
      shape: "arch" as const,
      c: "var(--blue)",
      n: "var(--paper)",
    },
    {
      t: "It searches real places",
      p: "Qloo finds venues where you are, with everyone's loves as signals. Places with no menu data are set aside, and the search widens if too few are left.",
      shape: "square" as const,
      c: "var(--pink)",
      n: "var(--ink)",
    },
    {
      t: "Nobody is left out",
      p: "Every venue is scored for every person against its own Qloo tags. The person it suits least decides most of the ranking; Qloo's own affinity only breaks near ties.",
      shape: "leaf" as const,
      c: "var(--green)",
      n: "var(--paper)",
    },
    {
      t: "It writes each order",
      p: "Menu highlights are matched to each person's cuisines. Vegetarians only get dishes whose names carry no meat, fish or egg, and a house favourite is labelled as one.",
      shape: "quarter" as const,
      c: "var(--paper)",
      n: "var(--ink)",
    },
  ];
  return (
    <section id="how" className={s.how} aria-labelledby="how-h">
      <h2 id="how-h" className={s.howTitle}>
        How Sapor decides
      </h2>
      <ol className={s.howList}>
        {steps.map((x, i) => (
          <li key={x.t}>
            <span className={s.howMark} style={{ ["--n" as string]: x.n }}>
              <Glyph shape={x.shape} color={x.c} size={54} />
              <span>{i + 1}</span>
            </span>
            <h3 className={s.h3}>{x.t}</h3>
            <p>{x.p}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
