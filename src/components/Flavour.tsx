"use client";

import { useEffect, useState } from "react";
import { Glyph } from "./art";
import { FORTUNES, INTRO_LINES, QUOTES, WORKING_LINES } from "./lines";
import f from "./flavour.module.css";

/*
 * Intro: a 1.2 s Bauhaus splash on every load, like an app's launch
 * screen. Pure CSS timing, never blocks clicks, skipped for reduced
 * motion. The line is chosen by a tiny script in the layout's <head>
 * before paint, so there is no flicker and no hydration mismatch.
 */

export function Intro() {
  return (
    <div className={f.intro} aria-hidden>
      <div className={f.introShapes}>
        <span className={f.s1}>
          <Glyph shape="circle" color="var(--red)" size={64} />
        </span>
        <span className={f.s2}>
          <Glyph shape="arch" color="var(--blue)" size={64} />
        </span>
        <span className={f.s3}>
          <Glyph shape="square" color="var(--ink)" size={64} />
        </span>
        <span className={f.s4}>
          <Glyph shape="leaf" color="var(--green)" size={64} />
        </span>
      </div>
      <p className={f.introWord}>Sapor</p>
      <div className={f.introLines}>
        {INTRO_LINES.map((l, i) => (
          <p key={l} data-i={i}>
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

/* Ticker: real food quotes in a Bauhaus band */

export function Ticker() {
  const items = [...QUOTES, ...QUOTES];
  return (
    <section className={f.ticker} aria-label="Food quotes">
      <div className={f.track}>
        {items.map((q, i) => (
          <figure key={i} className={f.quote} aria-hidden={i >= QUOTES.length}>
            <Glyph shape={(["circle", "arch", "square", "leaf", "quarter", "drop"] as const)[i % 6]} color="var(--yellow)" size={22} />
            <blockquote>&ldquo;{q.text}&rdquo;</blockquote>
            <figcaption>{q.who}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* Working quips: rotate while the agent reads the table */

export function WorkingQuip() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const start = setTimeout(() => setI(Math.floor(Math.random() * WORKING_LINES.length)), 0);
    const t = setInterval(() => setI((x) => (x + 1) % WORKING_LINES.length), 1900);
    return () => {
      clearTimeout(start);
      clearInterval(t);
    };
  }, []);
  return (
    <p className={f.quip} aria-live="off" key={i}>
      {WORKING_LINES[i]}
    </p>
  );
}

/* Fortune badge: a spinning corner badge that hands out a food line */

export function FortuneBadge() {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    const t = setTimeout(() => setOpen(false), 6500);
    return () => {
      window.removeEventListener("keydown", close);
      clearTimeout(t);
    };
  }, [open, i]);

  const crack = () => {
    setI((x) => (open ? (x + 1) % FORTUNES.length : Math.floor(Math.random() * FORTUNES.length)));
    setOpen(true);
  };

  return (
    <div className={f.fortune}>
      {open && (
        <p className={f.bubble} role="status" key={i}>
          {FORTUNES[i]}
        </p>
      )}
      <button type="button" className={f.badge} onClick={crack} aria-label="Get a food fortune">
        <svg viewBox="0 0 100 100" className={f.ring} aria-hidden>
          <defs>
            <path id="fortune-ring" d="M50 50 m-38 0 a38 38 0 1 1 76 0 a38 38 0 1 1 -76 0" />
          </defs>
          <text>
            <textPath href="#fortune-ring">savour the same place · savour the same place ·</textPath>
          </text>
        </svg>
        <span className={f.core}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            {/* fork and spoon */}
            <path d="M7 3v6a2 2 0 0 0 4 0V3M9 3v18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <ellipse cx="16.5" cy="7" rx="2.6" ry="4" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 11v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
      </button>
    </div>
  );
}
