/**
 * Sapor's illustration set. Every drawing here is original, built from the
 * same Bauhaus vocabulary as the rest of the interface: circles, half-moons,
 * bars and triangles in the house palette with a heavy ink line.
 */

import type { CSSProperties, ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* Palette and people                                                  */
/* ------------------------------------------------------------------ */

export const C = {
  bone: "var(--bone)",
  paper: "var(--paper)",
  ink: "var(--ink)",
  red: "var(--red)",
  yellow: "var(--yellow)",
  blue: "var(--blue)",
  green: "var(--green)",
  pink: "var(--pink)",
} as const;

export type Shape = "circle" | "arch" | "square" | "leaf" | "quarter" | "drop";

/** Each seat at the table gets a colour and a shape, in this order. */
export const SEATS: { color: string; on: string; shape: Shape; name: string }[] = [
  { color: "var(--red)", on: "var(--paper)", shape: "circle", name: "red" },
  { color: "var(--blue)", on: "var(--paper)", shape: "arch", name: "blue" },
  { color: "var(--yellow)", on: "var(--ink)", shape: "square", name: "yellow" },
  { color: "var(--green)", on: "var(--paper)", shape: "leaf", name: "green" },
  { color: "var(--pink)", on: "var(--ink)", shape: "quarter", name: "pink" },
  { color: "var(--ink)", on: "var(--paper)", shape: "drop", name: "ink" },
];

export const seat = (i: number) => SEATS[i % SEATS.length];

export const SHAPE_RADIUS: Record<Shape, string> = {
  circle: "50%",
  arch: "999px 999px 0 0",
  square: "0",
  leaf: "0 60% 0 60%",
  quarter: "100% 0 0 0",
  drop: "50% 50% 50% 0",
};

/* ------------------------------------------------------------------ */
/* Seeded randomness: identical on server and client                   */
/* ------------------------------------------------------------------ */

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export const hash = (str: string) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/* ------------------------------------------------------------------ */
/* Mosaic tiles                                                        */
/* ------------------------------------------------------------------ */

type TileKind = "circle" | "quarter" | "half" | "triangle" | "split" | "dot" | "ring" | "plain";
const KINDS: TileKind[] = ["circle", "quarter", "half", "triangle", "split", "dot", "ring", "plain", "quarter", "half"];

export function Tile({ kind, fg, bg, rot }: { kind: TileKind; fg: string; bg: string; rot: number }) {
  let shape: ReactNode = null;
  switch (kind) {
    case "circle":
      shape = <circle cx="50" cy="50" r="50" fill={fg} />;
      break;
    case "quarter":
      shape = <path d="M0 0 H100 A100 100 0 0 1 0 100 Z" fill={fg} />;
      break;
    case "half":
      shape = <path d="M0 50 A50 50 0 0 1 100 50 V100 H0 Z" fill={fg} />;
      break;
    case "triangle":
      shape = <path d="M0 0 H100 L0 100 Z" fill={fg} />;
      break;
    case "split":
      shape = (
        <>
          <rect width="50" height="100" fill={fg} />
          <circle cx="50" cy="50" r="22" fill={bg} />
        </>
      );
      break;
    case "dot":
      shape = <circle cx="50" cy="50" r="22" fill={fg} />;
      break;
    case "ring":
      shape = <circle cx="50" cy="50" r="34" fill="none" stroke={fg} strokeWidth="14" />;
      break;
    case "plain":
      shape = null;
      break;
  }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden style={{ transform: `rotate(${rot}deg)` }}>
      <rect width="100" height="100" fill={bg} />
      {shape}
    </svg>
  );
}

const MOSAIC_COLORS = ["var(--red)", "var(--yellow)", "var(--blue)", "var(--green)", "var(--ink)", "var(--bone)", "var(--pink)"];

export type MosaicTile = { kind: TileKind; fg: string; bg: string; rot: number; delay: number };

/** A deterministic mosaic. `colors` limits the palette (used for a table's own mosaic). */
export function makeMosaic(seed: number, count: number, colors: string[] = MOSAIC_COLORS): MosaicTile[] {
  const r = rng(seed);
  const tiles: MosaicTile[] = [];
  for (let i = 0; i < count; i++) {
    const fg = colors[Math.floor(r() * colors.length)];
    let bg = MOSAIC_COLORS[Math.floor(r() * MOSAIC_COLORS.length)];
    if (bg === fg) bg = fg === "var(--bone)" ? "var(--ink)" : "var(--bone)";
    tiles.push({
      kind: KINDS[Math.floor(r() * KINDS.length)],
      fg,
      bg,
      rot: [0, 90, 180, 270][Math.floor(r() * 4)],
      delay: Math.round(r() * 700),
    });
  }
  return tiles;
}

/**
 * The table's mosaic: each person's colour fills tiles in proportion to how
 * well the venue fits them. The pieces come together.
 */
export function tableMosaic(seed: number, shares: { color: string; weight: number }[], count: number): MosaicTile[] {
  const r = rng(seed);
  const total = shares.reduce((s, x) => s + Math.max(0.05, x.weight), 0) || 1;
  const owners: string[] = [];
  for (const s of shares) {
    const n = Math.max(1, Math.round((Math.max(0.05, s.weight) / total) * count));
    for (let i = 0; i < n; i++) owners.push(s.color);
  }
  while (owners.length < count) owners.push("var(--bone)");
  owners.length = count;
  // shuffle deterministically
  for (let i = owners.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [owners[i], owners[j]] = [owners[j], owners[i]];
  }
  return owners.map((fg) => {
    const bgPool = ["var(--bone)", "var(--paper)", "var(--ink)"];
    let bg = bgPool[Math.floor(r() * bgPool.length)];
    if (bg === "var(--ink)" && fg === "var(--ink)") bg = "var(--bone)";
    return {
      kind: (["circle", "quarter", "half", "triangle", "quarter", "half"] as TileKind[])[Math.floor(r() * 6)],
      fg,
      bg,
      rot: [0, 90, 180, 270][Math.floor(r() * 4)],
      delay: Math.round(r() * 900),
    };
  });
}

export function Mosaic({
  tiles,
  cols,
  className,
  tileClass,
  style,
}: {
  tiles: MosaicTile[];
  cols: number;
  className?: string;
  tileClass?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className} style={{ ...style, display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)` }} aria-hidden>
      {tiles.map((t, i) => (
        <div key={i} className={tileClass} style={{ ["--d" as string]: `${t.delay}ms`, ["--r" as string]: `${t.rot}deg` }}>
          <Tile {...t} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seat glyph                                                          */
/* ------------------------------------------------------------------ */

export function Glyph({ shape, color, size = 28 }: { shape: Shape; color: string; size?: number }) {
  const p: Record<Shape, ReactNode> = {
    circle: <circle cx="50" cy="50" r="48" fill={color} />,
    arch: <path d="M4 100 V50 A46 46 0 0 1 96 50 V100 Z" fill={color} />,
    square: <rect x="6" y="6" width="88" height="88" fill={color} />,
    leaf: <path d="M4 96 C4 40 40 4 96 4 C96 60 60 96 4 96 Z" fill={color} />,
    quarter: <path d="M4 96 V4 A92 92 0 0 1 96 96 Z" fill={color} />,
    drop: <path d="M50 4 A46 46 0 1 1 4 50 V4 Z" fill={color} />,
  };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      {p[shape]}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Dish illustrations                                                  */
/* ------------------------------------------------------------------ */

export type DishKind =
  | "coffee" | "chai" | "bao" | "pizza" | "cake" | "noodles" | "biryani" | "dosa" | "icecream" | "burger"
  | "sandwich" | "croissant" | "waffle" | "momo" | "salad" | "fries" | "drink" | "pasta" | "taco" | "sushi"
  | "pancakes" | "sweet" | "soup" | "plate";

const DISH_RULES: [DishKind, string[]][] = [
  ["bao", ["bao", "bun"]],
  ["momo", ["momo", "dumpling", "dim sum", "dimsum", "gyoza", "wonton"]],
  ["dosa", ["dosa", "idli", "uttapam", "vada", "appam"]],
  ["biryani", ["biryani", "mandi", "haleem", "curry", "korma", "makhani", "dal", "masala", "kebab", "kabab", "tikka", "pulao", "kabsa", "sizzler"]],
  ["noodles", ["noodle", "ramen", "udon", "japchae", "pho", "hakka", "chow", "pad thai", "ramyeon"]],
  ["pasta", ["pasta", "lasagna", "lasagne", "ravioli", "penne", "spaghetti", "alfredo", "gnocchi", "arrabbiata", "carbonara", "mac"]],
  ["pizza", ["pizza", "pizzas", "focaccia", "feteer"]],
  ["sushi", ["sushi", "maki", "nigiri", "kimbap"]],
  ["taco", ["taco", "burrito", "nacho", "quesadilla", "fajita"]],
  ["burger", ["burger", "slider"]],
  ["sandwich", ["sandwich", "toast", "panini", "club", "bruschetta", "sub", "wrap", "roll", "shawarma"]],
  ["croissant", ["croissant", "pastry", "pastries", "puff", "danish", "quiche", "tart"]],
  ["waffle", ["waffle"]],
  ["pancakes", ["pancake", "crepe", "crêpe"]],
  ["icecream", ["ice cream", "gelato", "kulfi", "sundae", "sorbet", "soft serve", "affogato", "falooda"]],
  ["cake", ["cake", "cheesecake", "brownie", "tiramisu", "tres leches", "mousse", "kunafa", "knafeh", "baklava", "cookie", "donut", "doughnut", "macaron", "pie"]],
  ["sweet", ["gulab", "jamun", "halwa", "rasmalai", "mithai", "sweet", "sweets", "chocolate", "nutella", "lovely", "dessert", "desserts", "pudding", "custard", "brulee"]],
  ["fries", ["fries", "chips", "wedges", "onion rings", "popcorn", "nachos"]],
  ["salad", ["salad", "bowl", "hummus", "falafel", "poke"]],
  ["soup", ["soup", "broth", "rasam", "tom yum", "marag"]],
  ["chai", ["chai", "tea", "matcha", "kahwa", "irani"]],
  ["coffee", ["coffee", "latte", "cappuccino", "espresso", "americano", "mocha", "cortado", "flat white", "cold brew", "brew", "frappe"]],
  ["drink", ["shake", "smoothie", "juice", "mojito", "lemonade", "soda", "cooler", "iced", "lassi", "boba", "bubble"]],
];

export function dishKind(dish: string): DishKind {
  const d = ` ${dish.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ")} `;
  for (const [kind, words] of DISH_RULES) {
    if (words.some((w) => d.includes(` ${w} `) || d.includes(` ${w}s `) || d.includes(` ${w}es `))) return kind;
  }
  return "plate";
}

const INK = "var(--ink)";
const SW = 4; // stroke width

function Steam({ x = 0 }: { x?: number }) {
  return (
    <g fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round">
      <path d={`M${40 + x} 22 q-6 -6 0 -12`} />
      <path d={`M${52 + x} 22 q-6 -6 0 -12`} />
    </g>
  );
}

const DRAW: Record<DishKind, (a: string, b: string) => ReactNode> = {
  coffee: (a, b) => (
    <>
      <ellipse cx="50" cy="84" rx="38" ry="7" fill={b} stroke={INK} strokeWidth={SW} />
      <path d="M24 40 H72 V62 A24 20 0 0 1 24 62 Z" fill={a} stroke={INK} strokeWidth={SW} />
      <circle cx="78" cy="52" r="9" fill="none" stroke={INK} strokeWidth={SW} />
      <rect x="24" y="40" width="48" height="7" fill={INK} />
      <Steam />
    </>
  ),
  chai: (a, b) => (
    <>
      <path d="M30 30 H70 L64 86 H36 Z" fill={C.paper} stroke={INK} strokeWidth={SW} />
      <path d="M32.5 46 H67.5 L64 86 H36 Z" fill={a} />
      <path d="M30 30 H70 L64 86 H36 Z" fill="none" stroke={INK} strokeWidth={SW} />
      <circle cx="50" cy="64" r="7" fill={b} />
      <Steam x={-2} />
    </>
  ),
  bao: (a, b) => (
    <>
      {/* a folded gua bao seen from the side: hinge on the left, filling spilling out on the right */}
      <path d="M10 56 C30 66 60 70 90 68 C80 92 22 92 10 56 Z" fill={C.paper} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M26 56 C46 58 70 58 94 54 L92 66 C70 66 46 64 26 60 Z" fill={a} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M28 52 C50 50 70 46 92 40 L96 50 C74 54 50 56 28 56 Z" fill={b} stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
      <path d="M10 56 C10 26 56 14 90 34 C62 40 34 46 10 56 Z" fill={C.paper} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <circle cx="40" cy="34" r="2.6" fill={INK} />
      <circle cx="50" cy="30" r="2.6" fill={INK} />
      <circle cx="58" cy="33" r="2.6" fill={INK} />
    </>
  ),
  pizza: (a, b) => (
    <>
      <path d="M14 22 L86 22 L50 92 Z" fill={C.yellow} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <rect x="12" y="14" width="76" height="11" fill={b} stroke={INK} strokeWidth={SW} />
      <circle cx="38" cy="38" r="7" fill={a} />
      <circle cx="60" cy="40" r="6" fill={a} />
      <circle cx="50" cy="60" r="6" fill={a} />
    </>
  ),
  cake: (a, b) => (
    <>
      <path d="M12 76 L88 76 L88 46 L12 60 Z" fill={C.paper} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M12 68 L88 62 L88 54 L12 64 Z" fill={a} />
      <path d="M12 60 L88 46" stroke={INK} strokeWidth={SW} />
      <rect x="12" y="76" width="76" height="8" fill={b} stroke={INK} strokeWidth={SW} />
      <circle cx="64" cy="38" r="8" fill={C.red} stroke={INK} strokeWidth={3} />
      <path d="M64 30 q4 -8 10 -10" stroke={INK} strokeWidth={3} fill="none" />
    </>
  ),
  noodles: (a, b) => (
    <>
      <path d="M20 14 L44 50 M34 10 L52 48" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <path d="M10 52 H90 A40 36 0 0 1 10 52 Z" fill={a} stroke={INK} strokeWidth={SW} />
      <g fill="none" stroke={C.yellow} strokeWidth={4.5} strokeLinecap="round">
        <path d="M24 52 q6 -14 12 0 t12 0 t12 0 t12 0" />
        <path d="M30 46 q6 -12 12 0 t12 0 t12 0" stroke={b} />
      </g>
      <rect x="40" y="86" width="20" height="5" fill={INK} />
    </>
  ),
  biryani: (a, b) => (
    <>
      <path d="M14 48 H86 V60 A36 30 0 0 1 14 60 Z" fill={a} stroke={INK} strokeWidth={SW} />
      <path d="M22 48 A28 18 0 0 1 78 48 Z" fill={C.paper} stroke={INK} strokeWidth={SW} />
      <g fill={C.yellow}>
        <circle cx="36" cy="42" r="3" />
        <circle cx="46" cy="38" r="3" />
        <circle cx="56" cy="41" r="3" />
        <circle cx="64" cy="44" r="3" />
      </g>
      <circle cx="52" cy="30" r="5" fill={b} />
      <rect x="8" y="50" width="8" height="6" fill={INK} />
      <rect x="84" y="50" width="8" height="6" fill={INK} />
    </>
  ),
  dosa: (a, b) => (
    <>
      <ellipse cx="50" cy="80" rx="44" ry="9" fill={C.paper} stroke={INK} strokeWidth={SW} />
      <path d="M8 72 L92 40 L92 74 Z" fill={C.yellow} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M36 62 L92 52 M58 56 L92 62" stroke={INK} strokeWidth={2.5} />
      <circle cx="26" cy="38" r="11" fill={a} stroke={INK} strokeWidth={SW} />
      <circle cx="50" cy="26" r="9" fill={b} stroke={INK} strokeWidth={SW} />
    </>
  ),
  icecream: (a, b) => (
    <>
      <path d="M32 50 H68 L50 94 Z" fill={C.yellow} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M38 62 L60 58 M42 72 L58 70" stroke={INK} strokeWidth={2.5} />
      <circle cx="50" cy="40" r="17" fill={a} stroke={INK} strokeWidth={SW} />
      <circle cx="50" cy="20" r="11" fill={b} stroke={INK} strokeWidth={SW} />
    </>
  ),
  burger: (a, b) => (
    <>
      <path d="M14 44 A36 28 0 0 1 86 44 Z" fill={C.yellow} stroke={INK} strokeWidth={SW} />
      <rect x="10" y="44" width="80" height="7" fill={C.green} />
      <rect x="12" y="51" width="76" height="11" fill={a} stroke={INK} strokeWidth={SW} />
      <rect x="10" y="62" width="80" height="6" fill={b} />
      <path d="M14 68 H86 V74 A10 10 0 0 1 76 84 H24 A10 10 0 0 1 14 74 Z" fill={C.yellow} stroke={INK} strokeWidth={SW} />
    </>
  ),
  sandwich: (a, b) => (
    <>
      <path d="M12 74 L88 74 L50 22 Z" fill={C.paper} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M22 66 H78 L72 58 H28 Z" fill={a} />
      <path d="M30 56 H70 L64 48 H36 Z" fill={b} />
      <rect x="10" y="74" width="80" height="10" fill={C.yellow} stroke={INK} strokeWidth={SW} />
    </>
  ),
  croissant: (a, b) => (
    <>
      <path d="M10 70 A40 34 0 0 1 90 70 Q70 58 50 64 Q30 58 10 70 Z" fill={C.yellow} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M34 40 Q40 54 36 62 M50 34 Q54 50 50 62 M66 40 Q60 54 64 62" stroke={INK} strokeWidth={3} fill="none" />
      <circle cx="80" cy="26" r="8" fill={a} />
      <rect x="12" y="18" width="12" height="12" fill={b} />
    </>
  ),
  waffle: (a, b) => (
    <>
      <rect x="18" y="22" width="64" height="58" fill={C.yellow} stroke={INK} strokeWidth={SW} />
      <path d="M18 41 H82 M18 61 H82 M39 22 V80 M61 22 V80" stroke={INK} strokeWidth={3} />
      <circle cx="68" cy="28" r="11" fill={a} stroke={INK} strokeWidth={3} />
      <path d="M30 22 V12" stroke={b} strokeWidth={6} />
    </>
  ),
  momo: (a, b) => (
    <>
      <ellipse cx="50" cy="80" rx="40" ry="8" fill={a} stroke={INK} strokeWidth={SW} />
      {[22, 50, 78].map((cx, i) => (
        <g key={cx}>
          <path d={`M${cx - 15} 72 A15 17 0 0 1 ${cx + 15} 72 Z`} fill={i === 1 ? b : C.paper} stroke={INK} strokeWidth={SW} />
          <path d={`M${cx - 5} 58 L${cx} 52 L${cx + 5} 58`} stroke={INK} strokeWidth={2.5} fill="none" />
        </g>
      ))}
    </>
  ),
  salad: (a, b) => (
    <>
      <circle cx="36" cy="44" r="14" fill={C.green} stroke={INK} strokeWidth={3} />
      <circle cx="58" cy="38" r="12" fill={a} stroke={INK} strokeWidth={3} />
      <circle cx="70" cy="50" r="9" fill={b} stroke={INK} strokeWidth={3} />
      <path d="M12 54 H88 A38 32 0 0 1 12 54 Z" fill={C.paper} stroke={INK} strokeWidth={SW} />
      <rect x="40" y="84" width="20" height="5" fill={INK} />
    </>
  ),
  fries: (a, b) => (
    <>
      {[30, 40, 50, 60, 70].map((x, i) => (
        <rect key={x} x={x - 3} y={14 + (i % 2) * 8} width="7" height="40" fill={C.yellow} stroke={INK} strokeWidth={2.5} />
      ))}
      <path d="M22 44 H78 L70 90 H30 Z" fill={a} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <circle cx="50" cy="66" r="9" fill={b} />
    </>
  ),
  drink: (a, b) => (
    <>
      <path d="M58 6 L50 34" stroke={INK} strokeWidth={4} strokeLinecap="round" />
      <path d="M30 26 H70 L64 92 H36 Z" fill={C.paper} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <path d="M31.5 42 H68.5 L64 92 H36 Z" fill={a} />
      <path d="M30 26 H70 L64 92 H36 Z" fill="none" stroke={INK} strokeWidth={SW} />
      <circle cx="68" cy="26" r="10" fill={b} stroke={INK} strokeWidth={3} />
    </>
  ),
  pasta: (a, b) => (
    <>
      <circle cx="50" cy="56" r="38" fill={C.paper} stroke={INK} strokeWidth={SW} />
      <circle cx="50" cy="56" r="26" fill={C.yellow} />
      <g fill="none" stroke={INK} strokeWidth={2.5}>
        <circle cx="50" cy="56" r="18" />
        <circle cx="50" cy="56" r="10" />
      </g>
      <circle cx="60" cy="48" r="6" fill={a} />
      <circle cx="40" cy="64" r="5" fill={b} />
      <path d="M50 56 L82 14" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    </>
  ),
  taco: (a, b) => (
    <>
      <path d="M20 48 q8 -14 16 -4 q8 -14 16 -4 q8 -14 16 -4 q6 -8 12 2" fill={C.green} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <circle cx="38" cy="44" r="6" fill={a} stroke={INK} strokeWidth={2.5} />
      <circle cx="60" cy="42" r="5" fill={b} stroke={INK} strokeWidth={2.5} />
      <path d="M12 50 A38 38 0 0 0 88 50 Z" fill={C.yellow} stroke={INK} strokeWidth={SW} />
      <path d="M26 60 A26 26 0 0 0 74 60" fill="none" stroke={INK} strokeWidth={2.5} />
    </>
  ),
  sushi: (a, b) => (
    <>
      {[30, 70].map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy="54" r="20" fill={INK} />
          <circle cx={cx} cy="54" r="15" fill={C.paper} />
          <circle cx={cx} cy="54" r="7" fill={i ? b : a} />
        </g>
      ))}
      <rect x="10" y="78" width="80" height="6" fill={C.green} />
    </>
  ),
  pancakes: (a, b) => (
    <>
      <ellipse cx="50" cy="84" rx="40" ry="7" fill={C.paper} stroke={INK} strokeWidth={SW} />
      {[72, 60, 48].map((y) => (
        <rect key={y} x="18" y={y} width="64" height="12" fill={C.yellow} stroke={INK} strokeWidth={3.5} />
      ))}
      <path d="M22 48 H78 V54 Q70 62 64 54 Q56 64 48 54 Q38 62 30 54 Q26 58 22 54 Z" fill={a} />
      <rect x="42" y="38" width="16" height="10" fill={b} stroke={INK} strokeWidth={3} />
    </>
  ),
  sweet: (a, b) => (
    <>
      <ellipse cx="50" cy="82" rx="40" ry="8" fill={C.paper} stroke={INK} strokeWidth={SW} />
      <circle cx="34" cy="60" r="15" fill={a} stroke={INK} strokeWidth={SW} />
      <circle cx="64" cy="58" r="17" fill={b} stroke={INK} strokeWidth={SW} />
      <circle cx="50" cy="36" r="10" fill={C.yellow} stroke={INK} strokeWidth={SW} />
    </>
  ),
  soup: (a, b) => (
    <>
      <path d="M12 46 H88 A38 34 0 0 1 12 46 Z" fill={a} stroke={INK} strokeWidth={SW} />
      <ellipse cx="50" cy="46" rx="36" ry="6" fill={b} />
      <path d="M70 40 L92 16" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <Steam x={-6} />
    </>
  ),
  plate: (a, b) => (
    <>
      <circle cx="50" cy="54" r="36" fill={C.paper} stroke={INK} strokeWidth={SW} />
      <circle cx="50" cy="54" r="22" fill={a} />
      <path d="M50 32 A22 22 0 0 1 72 54 H50 Z" fill={b} />
      <path d="M8 26 V82 M92 26 V82" stroke={INK} strokeWidth={4} strokeLinecap="round" />
    </>
  ),
};

/** An original, geometric drawing of a dish. `a` and `b` are the two accent colours. */
export function DishArt({
  dish,
  a,
  b,
  size = 96,
  title,
  kind: forced,
}: {
  dish: string;
  a: string;
  b: string;
  size?: number;
  title?: string;
  kind?: DishKind;
}) {
  const kind = forced ?? dishKind(dish);
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={title ?? `Illustration: ${dish}`}>
      {DRAW[kind](a, b)}
    </svg>
  );
}

export const ALL_DISHES: DishKind[] = Object.keys(DRAW) as DishKind[];
export const DISH_SAMPLE: Record<DishKind, string> = Object.fromEntries(ALL_DISHES.map((k) => [k, k])) as Record<DishKind, string>;
