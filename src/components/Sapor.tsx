"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import s from "./sapor.module.css";

/* ------------------------------------------------------------------ */
/* Types mirrored from the server (kept small on purpose)               */
/* ------------------------------------------------------------------ */

type Candidate = { id: string; name: string; kind: string; year?: number; blurb?: string; popularity: number };
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
  order?: { dish: string; matchedCuisine?: string; keyword?: string; kind: "taste_match" | "house_favourite" };
};
type Pick = {
  id: string;
  name: string;
  area?: string;
  address?: string;
  image?: string;
  rating?: number;
  lat?: number;
  lon?: number;
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
  qloo: { calls: number; cached: number; requests: { path: string; params: Record<string, string>; ms: number; cached: boolean }[] };
};
type Narration = { id: string; headline: string; why: string; lines: Record<string, string>; via: string };

type Run =
  | { state: "idle" }
  | { state: "running"; steps: Step[]; names: Record<string, string> }
  | { state: "done"; steps: Step[]; names: Record<string, string>; result: Result; narration: Record<string, Narration> }
  | { state: "error"; steps: Step[]; message: string };

/* ------------------------------------------------------------------ */

// Deterministic ids: the same sequence on server and client, so prerendering stays stable.
let seq = 0;
const uid = () => `u${(seq += 1)}`;
const KIND_LABEL: Record<string, string> = {
  artist: "music",
  movie: "film",
  tv_show: "TV show",
  book: "book",
  podcast: "podcast",
  videogame: "game",
};
const ASK_LABEL: Record<string, string> = {
  artist: "The music act",
  movie: "The film",
  tv_show: "The show",
  book: "The book",
  podcast: "The podcast",
  videogame: "The game",
};
const OCCASIONS: { id: Occasion; label: string }[] = [
  { id: "coffee", label: "Coffee" },
  { id: "meal", label: "A meal" },
  { id: "dessert", label: "Dessert" },
];
const PLACES = ["Jubilee Hills, Hyderabad", "Banjara Hills, Hyderabad", "Gachibowli, Hyderabad", "Indiranagar, Bengaluru", "Brooklyn, New York"];

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
      resolvedLove({ id: "F347D506-CB6F-46FA-9A8B-AFBC31C71A1A", name: "BTS", kind: "artist", popularity: 0.996 }),
      resolvedLove({ id: "340C4A42-8726-42C9-BFA6-FBA6F923E5E6", name: "Squid Game", kind: "tv_show", year: 2021, popularity: 0.99 }),
    ],
  },
  {
    uid: uid(),
    name: "Arjun",
    veg: true,
    draft: "",
    loves: [
      resolvedLove({ id: "9986F595-C20E-4EBB-828F-55E7DEEBE448", name: "A.R. Rahman", kind: "artist", popularity: 0.99 }),
      resolvedLove({ id: "D2AD70AF-0750-4202-8AD2-E57C4C616631", name: "Pushpa: The Rise - Part 1", kind: "movie", year: 2021, popularity: 0.98 }),
    ],
  },
  {
    uid: uid(),
    name: "Meera",
    veg: false,
    draft: "",
    loves: [
      resolvedLove({ id: "871AE4FF-0D03-45CE-A6E1-B255607FA3DD", name: "Prateek Kuhad", kind: "artist", popularity: 0.97 }),
      resolvedLove({ id: "EDA54D37-08C7-457D-83F8-1BCE21FEDC63", name: "Before Sunrise", kind: "movie", year: 1995, popularity: 0.98 }),
    ],
  },
];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const mapsUrl = (p: Pick) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.name, p.address].filter(Boolean).join(", "))}`;

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
  const checkRef = useRef<HTMLDivElement>(null);

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
        setParseNote(data.error ?? "Sapor couldn't find people and their loves in that. Try: Riya: BTS, Squid Game. Arjun: Pushpa.");
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
    const names: Record<string, string> = {};
    included.forEach((x, i) => (names[String.fromCharCode(65 + i)] = x.name.trim() || `Guest ${i + 1}`));
    const body = {
      city: city.trim(),
      occasion,
      friends: included.map((x) => ({
        veg: x.veg,
        loves: x.loves
          .filter((l) => l.status === "resolved" && l.chosen)
          .map((l) => ({ id: l.chosen!.id, name: l.chosen!.name, kind: l.chosen!.kind })),
      })),
    };
    setActive(0);
    setRun({ state: "running", steps: [], names });
    if (window.matchMedia("(max-width: 900px)").matches) {
      requestAnimationFrame(() => checkRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }

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
            setRun({ state: "running", steps: [...steps], names });
          } else if (ev.type === "result") {
            result = ev;
            if (!ev.picks.length) {
              setRun({ state: "done", steps: [...steps], names, result: ev, narration: {} });
            }
          } else if (ev.type === "narration") {
            for (const it of ev.items as Narration[]) narration[it.id] = it;
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        }
      }
      if (!result) throw new Error("The planner stopped early. Try again.");
      setRun({ state: "done", steps: [...steps], names, result, narration });
    } catch (e) {
      setRun({ state: "error", steps: [...steps], message: (e as Error).message });
    }
  };

  /* ---------------------------------------------------------------- */

  return (
    <div className={s.page}>
      <header className={s.masthead}>
        <div className={s.brand}>
          <span className={s.wordmark}>Sapor</span>
          <span className={s.gloss}>Latin for taste</span>
        </div>
        <a className={s.howLink} href="#how">
          How it decides
        </a>
      </header>

      <main className={s.grid}>
        <section className={s.composer} aria-labelledby="table-h">
          <h1 className={s.hero}>Where should we go?</h1>
          <p className={s.lede}>
            Everyone names a film, show or artist they love. Sapor reads the taste behind them with Qloo and picks a
            place that suits the whole table, down to what each of you should order.
          </p>

          <div className={s.tableHead}>
            <h2 id="table-h" className={s.h2}>
              Your table
            </h2>
            <div className={s.tableTools}>
              <button type="button" className={s.textBtn} onClick={() => setTyping((t) => !t)} aria-expanded={typing}>
                {typing ? "Back to seats" : "Type it out instead"}
              </button>
              <button type="button" className={s.textBtn} onClick={loadSample}>
                Try a sample table
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
                <button type="button" className={s.secondary} onClick={parseFreeText} disabled={parsing || !freeText.trim()}>
                  {parsing ? "Reading it" : "Fill in the seats"}
                </button>
                {parseNote && <p className={s.note}>{parseNote}</p>}
              </div>
            </div>
          ) : (
            <ol className={s.seats}>
              {seats.map((seat, i) => (
                <li key={seat.uid} className={s.seat}>
                  <div className={s.seatTop}>
                    <span className={s.seatNo} aria-hidden>
                      {i + 1}
                    </span>
                    <input
                      className={s.nameInput}
                      value={seat.name}
                      maxLength={24}
                      onChange={(e) => updateSeat(seat.uid, (x) => ({ ...x, name: e.target.value }))}
                      placeholder={`Guest ${i + 1}`}
                      aria-label={`Seat ${i + 1} name`}
                    />
                    <label className={s.veg}>
                      <input
                        type="checkbox"
                        checked={seat.veg}
                        onChange={(e) => updateSeat(seat.uid, (x) => ({ ...x, veg: e.target.checked }))}
                      />
                      <span>Veg</span>
                    </label>
                    {seats.length > 1 && (
                      <button
                        type="button"
                        className={s.remove}
                        onClick={() => setSeats((p) => p.filter((x) => x.uid !== seat.uid))}
                        aria-label={`Remove ${seat.name || `guest ${i + 1}`}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <ul className={s.loves}>
                    {seat.loves.map((l) => (
                      <li key={l.uid} className={s.love} data-status={l.status}>
                        {l.status === "resolved" && l.chosen && (
                          <span className={s.loveMain}>
                            <span className={s.loveName}>{l.chosen.name}</span>
                            <span className={s.loveKind}>
                              {KIND_LABEL[l.chosen.kind] ?? l.chosen.kind}
                              {l.chosen.year ? `, ${l.chosen.year}` : ""}
                            </span>
                          </span>
                        )}
                        {l.status === "pending" && (
                          <span className={s.loveMain}>
                            <span className={s.loveName}>{l.text}</span>
                            <span className={s.loveKind}>looking it up</span>
                          </span>
                        )}
                        {(l.status === "not_found" || l.status === "error") && (
                          <span className={s.loveMain}>
                            <span className={s.loveName}>{l.text}</span>
                            <span className={s.loveWarn}>
                              {l.status === "error" ? "Couldn't check this. Remove and try again." : "Qloo doesn't know this one. Try a fuller title."}
                            </span>
                          </span>
                        )}
                        {l.status === "ambiguous" && l.options && (
                          <span className={s.ask} role="group" aria-label={`Which ${l.text}?`}>
                            <span className={s.askQ}>Which {l.text}?</span>
                            {l.options.map((o) => (
                              <button
                                type="button"
                                key={o.id}
                                className={s.askOpt}
                                onClick={() => updateLove(seat.uid, l.uid, (x) => ({ ...x, status: "resolved", chosen: o }))}
                              >
                                {ASK_LABEL[o.kind] ?? o.kind}
                                {o.year ? ` (${o.year})` : ""}
                              </button>
                            ))}
                          </span>
                        )}
                        <button
                          type="button"
                          className={s.loveX}
                          onClick={() => updateSeat(seat.uid, (x) => ({ ...x, loves: x.loves.filter((y) => y.uid !== l.uid) }))}
                          aria-label={`Remove ${l.chosen?.name ?? l.text}`}
                        >
                          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
                            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        </button>
                      </li>
                    ))}
                    {seat.loves.length < 3 && (
                      <li className={s.addLove}>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            addLove(seat);
                          }}
                        >
                          <input
                            className={s.loveInput}
                            value={seat.draft}
                            maxLength={90}
                            onChange={(e) => updateSeat(seat.uid, (x) => ({ ...x, draft: e.target.value }))}
                            onBlur={() => seat.draft.trim() && addLove(seat)}
                            placeholder={seat.loves.length ? "Something else they love" : "A film, show, artist or book"}
                            aria-label={`Something ${seat.name || `guest ${i + 1}`} loves`}
                          />
                        </form>
                      </li>
                    )}
                  </ul>
                </li>
              ))}
            </ol>
          )}

          {!typing && seats.length < 6 && (
            <button type="button" className={s.textBtn} onClick={() => setSeats((p) => [...p, emptySeat()])}>
              Add a seat
            </button>
          )}

          <fieldset className={s.options}>
            <legend className={s.label}>What for</legend>
            <div className={s.segment}>
              {OCCASIONS.map((o) => (
                <label key={o.id} className={s.segOpt}>
                  <input type="radio" name="occasion" value={o.id} checked={occasion === o.id} onChange={() => setOccasion(o.id)} />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={s.options}>
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

          <div className={s.go}>
            <button type="button" className={s.primary} onClick={go} disabled={!ready.ok || run.state === "running"}>
              {run.state === "running" ? "Reading the table" : "Pick our place"}
            </button>
            <p className={s.goHint} aria-live="polite">
              {ready.waiting
                ? "Answer the question above first."
                : ready.filled.length === 0
                  ? "Add at least one love to a seat."
                  : `${ready.filled.length} ${ready.filled.length === 1 ? "person" : "people"} at the table. Names stay on this device.`}
            </p>
          </div>
        </section>

        <section className={s.output} ref={checkRef} aria-live="polite" aria-label="Sapor's pick">
          <Output run={run} active={active} setActive={setActive} />
        </section>
      </main>

      <HowItDecides />

      <footer className={s.footer}>
        <p>
          Taste data from Qloo&rsquo;s taste graph. Qloo describes what people with similar taste tend to like, not
          what any one person will do. Venues, tags and menu highlights come from Qloo; dish to cuisine matching is
          Sapor&rsquo;s own.
        </p>
        <p>Built by Victor Isaac for the Qloo Agentic Hackathon, 2026. Open source under MIT.</p>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Output({ run, active, setActive }: { run: Run; active: number; setActive: (n: number) => void }) {
  if (run.state === "idle") {
    return (
      <div className={s.blankCheck} aria-hidden="false">
        <div className={s.checkPaper}>
          <div className={s.checkHead}>
            <span>Guest check</span>
            <span className={s.checkNo}>No. 0000</span>
          </div>
          <p className={s.blankLine}>Seat your table and Sapor writes the order here: one place for everyone, and what each person should get.</p>
          <div className={s.ruled} aria-hidden>
            {Array.from({ length: 7 }).map((_, i) => (
              <span key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const steps = run.steps;
  return (
    <>
      <AgentLog steps={steps} running={run.state === "running"} names={run.state === "error" ? {} : run.names} />
      {run.state === "error" && (
        <div className={s.error} role="alert">
          <p>{run.message}</p>
        </div>
      )}
      {run.state === "done" && run.result.picks.length === 0 && (
        <div className={s.error} role="status">
          <p>
            Qloo has no {run.result.venueLabel}s with menu data for &ldquo;{run.result.city}&rdquo;. Try a nearby
            neighbourhood or a bigger city name.
          </p>
        </div>
      )}
      {run.state === "done" && run.result.picks.length > 0 && (
        <Check result={run.result} names={run.names} narration={run.narration} active={active} setActive={setActive} />
      )}
    </>
  );
}

function AgentLog({ steps, running, names }: { steps: Step[]; running: boolean; names: Record<string, string> }) {
  // The server only knows seats as A, B, C. Swap the names back in here, on the device.
  const named = (t: string) => t.replace(/\b([A-F]):/g, (m, k: string) => (names[k] ? `${names[k]}:` : m));
  return (
    <div className={s.log}>
      <h2 className={s.logTitle}>{running ? "Sapor is working" : "How Sapor got here"}</h2>
      <ol className={s.logList}>
        {steps.map((st) => (
          <li key={st.id} className={s.logItem} data-status={st.status}>
            <span className={s.logLabel}>{st.label}</span>
            {st.detail && <span className={s.logDetail}>{named(st.detail)}</span>}
          </li>
        ))}
        {running && steps.length === 0 && (
          <li className={s.logItem} data-status="running">
            <span className={s.logLabel}>Sending the table to Qloo</span>
          </li>
        )}
      </ol>
    </div>
  );
}

function Check({
  result,
  names,
  narration,
  active,
  setActive,
}: {
  result: Result;
  names: Record<string, string>;
  narration: Record<string, Narration>;
  active: number;
  setActive: (n: number) => void;
}) {
  const pick = result.picks[Math.min(active, result.picks.length - 1)];
  const nar = narration[pick.id];
  // A stable check number derived from the venue, like a pad's printed serial.
  const checkNo = String(1000 + ([...pick.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 9000));
  const [openId, setOpenId] = useState<string | null>(null);
  const open = openId === pick.id;
  const lowest = Math.min(...pick.friends.map((f) => f.fit));
  const lowestKey = pick.friends.find((f) => f.fit === lowest)?.key;

  return (
    <article className={s.check} key={pick.id}>
      <div className={s.checkPaper}>
        <div className={s.checkHead}>
          <span>
            Table for {pick.friends.length}, {result.occasion === "meal" ? "a meal" : result.occasion}
          </span>
          <span className={s.checkNo}>No. {checkNo}</span>
        </div>

        <div className={s.venueRow}>
          <h2 className={s.venue}>{pick.name}</h2>
          {pick.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={s.venueImg}
              src={pick.image}
              alt={`${pick.name}, photo from Qloo`}
              width={96}
              height={96}
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </div>
        <p className={s.venueMeta}>
          {[pick.area, pick.rating ? `rated ${pick.rating}` : null].filter(Boolean).join(", ")}
          {pick.address && (
            <>
              {" "}
              <a href={mapsUrl(pick)} target="_blank" rel="noreferrer" className={s.mapLink}>
                Open in Maps
              </a>
            </>
          )}
        </p>
        {nar?.why && <p className={s.why}>{nar.why}</p>}

        <ol className={s.orders}>
          {pick.friends.map((f, i) => (
            <li key={f.key} className={s.order} style={{ ["--i" as string]: i }}>
              <div className={s.orderLine}>
                <span className={s.diner}>{names[f.key]}</span>
                <span className={s.leader} aria-hidden />
                <span className={s.dish}>{f.order?.dish ?? "Ask the staff"}</span>
              </div>
              <div className={s.orderSub}>
                <span className={s.orderKind} data-kind={f.order?.kind ?? "none"}>
                  {f.order?.kind === "taste_match"
                    ? `Matches their lean towards ${f.order.matchedCuisine}`
                    : f.order
                      ? "House favourite, not a taste match"
                      : "No highlight fits"}
                </span>
                <span className={s.fit}>
                  <span className={s.fitBar} aria-hidden>
                    <span style={{ width: pct(f.fit) }} />
                  </span>
                  <span className={s.fitNum}>fits {pct(f.fit)}</span>
                </span>
              </div>
              {nar?.lines?.[f.key] && <p className={s.orderWhy}>{nar.lines[f.key]}</p>}
            </li>
          ))}
        </ol>

        <div className={s.total}>
          <span>Table fit</span>
          <span>
            Lowest {pct(lowest)}
            {lowestKey && pick.friends.length > 1 ? ` (${names[lowestKey]})` : ""}, average{" "}
            {pct(pick.friends.reduce((a, f) => a + f.fit, 0) / pick.friends.length)}
          </span>
        </div>

        <button type="button" className={s.evidenceBtn} aria-expanded={open} onClick={() => setOpenId(open ? null : pick.id)}>
          {open ? "Hide the evidence" : "Show the evidence"}
        </button>
        {open && <Evidence result={result} pick={pick} names={names} />}
      </div>

      {result.picks.length > 1 && (
        <div className={s.others}>
          <h3 className={s.h3}>Also fits</h3>
          <ul>
            {result.picks.map((p, i) =>
              i === active ? null : (
                <li key={p.id}>
                  <button type="button" className={s.otherBtn} onClick={() => setActive(i)}>
                    <span className={s.otherName}>{p.name}</span>
                    <span className={s.otherMeta}>
                      {p.area ? `${p.area}, ` : ""}lowest fit {pct(Math.min(...p.friends.map((f) => f.fit)))}
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

function Evidence({ result, pick, names }: { result: Result; pick: Pick; names: Record<string, string> }) {
  return (
    <div className={s.evidence}>
      <p className={s.evNote}>
        Everything below came back from Qloo for this request. Affinities describe groups with similar taste, not a
        prediction about any one of you.
      </p>
      <dl className={s.evList}>
        {result.profiles.map((p) => {
          const f = pick.friends.find((x) => x.key === p.key)!;
          return (
            <div key={p.key} className={s.evRow}>
              <dt>{names[p.key]}</dt>
              <dd>
                <p>
                  <span className={s.evK}>Leans</span> {p.cuisines.slice(0, 4).map((t) => `${t.name} ${t.affinity.toFixed(2)}`).join(", ") || "no cuisine signal"}
                </p>
                <p>
                  <span className={s.evK}>Rooms</span> {p.ambience.slice(0, 4).map((t) => `${t.name} ${t.affinity.toFixed(2)}`).join(", ") || "no ambience signal"}
                </p>
                <p>
                  <span className={s.evK}>Matched here</span> {f.matched.map((m) => m.name).join(", ") || "nothing directly"}
                  {"; "}their loves drove {pct(f.share)} of Qloo&rsquo;s score for this venue
                  {f.vegNote === "no_veg" ? "; nothing vegetarian on the highlights" : f.vegNote === "veg_friendly" ? "; tagged vegetarian-friendly" : ""}
                </p>
              </dd>
            </div>
          );
        })}
        <div className={s.evRow}>
          <dt>The venue</dt>
          <dd>
            <p>
              <span className={s.evK}>Qloo affinity</span> {pick.qlooAffinity.toFixed(3)}
            </p>
            {pick.vibe.length > 0 && (
              <p>
                <span className={s.evK}>Room</span> {pick.vibe.join(", ")}
              </p>
            )}
            {pick.cuisines.length > 0 && (
              <p>
                <span className={s.evK}>Cuisines</span> {pick.cuisines.join(", ")}
              </p>
            )}
            {pick.menu.length > 0 && (
              <p>
                <span className={s.evK}>Menu highlights</span> {pick.menu.join(", ")}
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
                <span className={s.evK}>Set aside</span> {result.rejected.map((r) => r.name).join(", ")}: no cuisine or menu
                data, so possibly not food venues.
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
  return (
    <section id="how" className={s.how} aria-labelledby="how-h">
      <h2 id="how-h" className={s.h2}>
        How Sapor decides
      </h2>
      <ol className={s.howList}>
        <li>
          <h3 className={s.h3}>It checks what you meant</h3>
          <p>Each love is looked up in Qloo. When a name could be two different things, like Dune the film and Dune the band, Sapor asks rather than guesses, because the two draw different crowds.</p>
        </li>
        <li>
          <h3 className={s.h3}>It reads the taste behind each person</h3>
          <p>Qloo returns the cuisines and kinds of rooms that people who share those loves tend to favour. BTS and Squid Game fans lean Korean and Thai and like hip rooms; A. R. Rahman fans lean Indian.</p>
        </li>
        <li>
          <h3 className={s.h3}>It searches real places nearby</h3>
          <p>Qloo finds venues in your area with everyone&rsquo;s loves as signals. Places with no menu data are set aside, and the search widens step by step if too few are left.</p>
        </li>
        <li>
          <h3 className={s.h3}>It makes sure nobody is left out</h3>
          <p>Every venue is scored for every person against its own Qloo tags. The ranking weighs the lowest score as much as the average, so one happy person can&rsquo;t carry a bad pick.</p>
        </li>
        <li>
          <h3 className={s.h3}>It writes each order</h3>
          <p>Sapor matches the venue&rsquo;s menu highlights to each person&rsquo;s cuisines, respects vegetarians, and says plainly when a dish is a house favourite rather than a taste match.</p>
        </li>
      </ol>
    </section>
  );
}
