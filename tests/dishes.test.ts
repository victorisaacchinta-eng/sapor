import { test } from "node:test";
import assert from "node:assert/strict";
import { isAlcohol, isDessert, isVeg, pickDish } from "../src/lib/dishes.ts";

test("vegetarian check rejects meat, fish and egg dishes", () => {
  for (const d of ["Korean chicken bao", "Meat lovers pizza", "Chicken shawarma", "Shawarma platter", "Beef bulgogi", "Bulgogi bowl",
    "Salmon sushi", "Sushi platter", "Arabic lamb keema pizza", "Crispy crusted fish fillet", "Egg benedict", "Prawn tempura", "Pho"]) {
    assert.equal(isVeg(d), false, d);
  }
});

test("dishes usually made with meat need a vegetarian marker", () => {
  assert.equal(isVeg("Steamed bao"), false);
  assert.equal(isVeg("Paneer korean bao"), true);
  assert.equal(isVeg("Veg momos"), true);
  assert.equal(isVeg("Momos"), false);
  assert.equal(isVeg("Mushroom ramen"), true);
});

test("plainly vegetarian dishes pass", () => {
  for (const d of ["Pav bhaji bruschetta", "Biscoff cheesecake", "Masala dosa", "Margherita pizza", "Eggplant parmigiana", "Filter coffee"]) {
    assert.equal(isVeg(d), true, d);
  }
});

test("alcohol is recognised, virgin drinks are not", () => {
  for (const d of ["Yuzu mojito", "Aperol spritz", "Craft beer", "Pina colada", "Moscow mule"]) assert.equal(isAlcohol(d), true, d);
  for (const d of ["Virgin mojito", "Mint mocktail", "Ginger ale", "Cold brew"]) assert.equal(isAlcohol(d), false, d);
});

const terra = ["Pav bhaji bruschetta", "Biscoff cheesecake", "Crispy chili chicken sizzler", "Korean chicken bao", "Paneer korean bao",
  "Arabic lamb keema pizza", "Crispy crusted fish fillet", "Yuzu mojito"];

test("a vegetarian is only ever given a vegetarian dish", () => {
  const d = pickDish([{ name: "Korean", affinity: 0.9 }, { name: "Indian", affinity: 0.8 }], terra, new Set(), true);
  assert.ok(d && isVeg(d.dish), d?.dish);
});

test("nobody is defaulted to alcohol", () => {
  const d = pickDish([{ name: "Mexican", affinity: 0.9 }], ["Yuzu mojito", "Craft beer"], new Set());
  assert.equal(d, undefined);
});

test("a dessert outing lands on a dessert when there is one", () => {
  const d = pickDish([{ name: "Korean", affinity: 0.9 }], terra, new Set(), false, "dessert");
  assert.ok(d && isDessert(d.dish), d?.dish);
});

test("the sample table gets the same orders it did before", () => {
  const taken = new Set<string>();
  const riya = pickDish([{ name: "Korean", affinity: 0.866 }], terra, taken);
  taken.add(riya!.dish);
  const arjun = pickDish([{ name: "Indian", affinity: 0.8 }], terra, taken, true);
  taken.add(arjun!.dish);
  const meera = pickDish([{ name: "Indian", affinity: 0.8 }], terra, taken);
  assert.equal(riya?.dish, "Korean chicken bao");
  assert.equal(arjun?.dish, "Pav bhaji bruschetta");
  assert.equal(meera?.dish, "Paneer korean bao");
});

test("a repeated dish is flagged as shared, never presented as a fresh pick", () => {
  const menu = ["Chocolate cake", "Cold brew"];
  const taken = new Set<string>(["Chocolate cake"]);
  const d = pickDish([{ name: "Dessert", affinity: 0.9 }], menu, taken, false, "dessert");
  assert.equal(d?.dish, "Chocolate cake");
  assert.equal(d?.shared, true);
  const first = pickDish([{ name: "Dessert", affinity: 0.9 }], menu, new Set(), false, "dessert");
  assert.equal(first?.shared, undefined);
});
