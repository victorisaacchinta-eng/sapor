import { test } from "node:test";
import assert from "node:assert/strict";
import { rank, tableScore, WEIGHTS } from "../src/lib/score.ts";

// The formula Sapor used before 22 Oct 2026, kept here to show why it was replaced.
const oldScore = (affinity: number, fits: number[]) => {
  const mean = fits.reduce((a, b) => a + b, 0) / fits.length;
  const low = Math.min(...fits);
  return affinity * (0.4 + 0.6 * ((mean + low) / 2));
};

// A: Qloo loves it, but one guest barely matches. B: moderate affinity, good for everyone.
// C: like B overall, but a lower weakest match.
const A = { id: "a", name: "A high affinity, one guest left out", affinity: 0.97, fits: [0.95, 0.95, 0.35] };
const B = { id: "b", name: "B good for everyone", affinity: 0.78, fits: [0.8, 0.78, 0.76] };
const C = { id: "c", name: "C similar average, weaker floor", affinity: 0.8, fits: [0.9, 0.84, 0.6] };

test("the old formula let Qloo affinity override fairness (counterexample)", () => {
  assert.ok(oldScore(A.affinity, A.fits) > oldScore(B.affinity, B.fits));
});

test("weakest person first: B beats A and C", () => {
  const order = rank([A, B, C]).map((v) => v.id);
  assert.deepEqual(order, ["b", "c", "a"]);
});

test("ranking agrees with a strict maximin baseline on this set", () => {
  const maximin = [A, B, C].sort((x, y) => Math.min(...y.fits) - Math.min(...x.fits)).map((v) => v.id);
  assert.deepEqual(rank([A, B, C]).map((v) => v.id), maximin);
});

test("affinity cannot outweigh a 25 point gap in the weakest match", () => {
  const loved = { id: "x", name: "x", affinity: 1, fits: [0.9, 0.9, 0.5] };
  const fair = { id: "y", name: "y", affinity: 0, fits: [0.9, 0.9, 0.75] };
  assert.equal(rank([loved, fair])[0].id, "y");
  assert.ok(WEIGHTS.affinity < WEIGHTS.lowest * 0.25 + 1e-9);
});

test("affinity breaks near ties", () => {
  const p = { id: "p", name: "p", affinity: 0.9, fits: [0.8, 0.8, 0.8] };
  const q = { id: "q", name: "q", affinity: 0.6, fits: [0.8, 0.8, 0.8] };
  assert.equal(rank([q, p])[0].id, "p");
});

test("ranking is deterministic for identical inputs", () => {
  const v = [A, B, C, { ...B, id: "b2", name: "B twin" }];
  assert.deepEqual(rank(v).map((x) => x.id), rank([...v].reverse()).map((x) => x.id));
});

test("scores stay in 0..1 and handle a single guest", () => {
  const s = tableScore([0.42], 0.5);
  assert.ok(s >= 0 && s <= 1);
  assert.equal(rank([{ id: "solo", name: "solo", affinity: 0.5, fits: [0.42] }]).length, 1);
});

// Live case, Jubilee Hills coffee, 22 Oct 2026. Rescaling affinity across candidates
// let Roast CCX (weakest match 0.737) beat Terra (weakest 0.83). It must not.
test("live regression: the venue with the better weakest match wins a close affinity race", () => {
  const roast = { id: "roast", name: "Roast CCX", affinity: 0.811, fits: [0.737, 1, 0.907] };
  const terra = { id: "terra", name: "Terra Cafe & Bistro", affinity: 0.779, fits: [0.986, 1, 0.83] };
  const aaromale = { id: "aaro", name: "Aaromale", affinity: 0.797, fits: [0.734, 0.984, 0.947] };
  assert.equal(rank([roast, terra, aaromale])[0].id, "terra");
});
