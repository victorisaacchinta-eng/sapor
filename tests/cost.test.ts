import { test } from "node:test";
import assert from "node:assert/strict";
import { costLabel, parseCost, tableEstimate } from "../src/lib/cost.ts";

test("a range keeps both ends", () => {
  const c = parseCost("₹600 to ₹1800");
  assert.deepEqual([c.costFrom, c.costTo, c.costOpen, c.currency], [600, 1800, undefined, "₹"]);
  assert.equal(costLabel(c), "₹600 to ₹1,800");
  assert.equal(tableEstimate(c, 3), "About ₹1,800 to ₹5,400 for 3 if that is per person, our estimate");
});

test("an open-ended price is a floor, never a fixed price", () => {
  for (const t of ["₹2000 or above", "$100 or above", "£50+", "₹1,500 and above"]) {
    const c = parseCost(t);
    assert.equal(c.costOpen, true, t);
    assert.equal(c.costTo, undefined, t);
    assert.ok(costLabel(c)!.endsWith("+"), t);
  }
  assert.equal(costLabel(parseCost("₹2000 or above")), "₹2,000+");
  assert.equal(tableEstimate(parseCost("₹2000 or above"), 3), "From ₹6,000 for 3 if that is per person, our estimate");
});

test("words stay words and get no estimate", () => {
  const c = parseCost("Moderately expensive");
  assert.equal(costLabel(c), "Moderately expensive");
  assert.equal(tableEstimate(c, 4), undefined);
});

test("dollars use western grouping", () => {
  assert.equal(costLabel(parseCost("$1000 to $250000")), "$1,000 to $250,000");
});

test("an unrecognised prefix is shown verbatim with no maths", () => {
  const c = parseCost("L1 to l10");
  assert.equal(costLabel(c), "L1 to l10");
  assert.equal(tableEstimate(c, 3), undefined);
});
