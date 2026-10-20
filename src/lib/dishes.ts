/**
 * Sapor's dish mapping.
 *
 * Qloo gives each venue a list of menu highlights ("Korean bun", "Kunafa gelato")
 * and gives each person a set of cuisine affinities ("Korean", "Middle Eastern").
 * Qloo does not link a specific dish to a cuisine, so this file does. It is a
 * small, transparent keyword map, and the UI labels it as Sapor's mapping, not
 * Qloo data.
 */

const CUISINE_KEYWORDS: Record<string, string[]> = {
  korean: ["korean", "kimchi", "bibimbap", "gochujang", "bulgogi", "tteok", "korean bun", "corn dog", "ramyeon", "ramyun", "kimbap", "japchae", "tteokbokki", "dalgona", "bingsu", "yakgwa"],
  japanese: ["japanese", "sushi", "ramen", "matcha", "katsu", "teriyaki", "miso", "mochi", "tempura", "gyoza", "udon", "onigiri", "yakitori"],
  chinese: ["chinese", "noodle", "manchurian", "dim sum", "dimsum", "momo", "chilli chicken", "chili chicken", "fried rice", "hakka", "schezwan", "szechuan", "dumpling", "spring roll", "bao"],
  thai: ["thai", "pad thai", "tom yum", "green curry", "red curry", "satay", "som tam", "khao"],
  vietnamese: ["vietnamese", "pho", "banh mi", "spring roll"],
  "pan asian": ["asian", "sushi", "noodle", "dim sum", "bao", "ramen", "thai", "korean"],
  asian: ["asian", "sushi", "noodle", "dim sum", "bao", "ramen", "thai", "korean"],
  indian: ["biryani", "paneer", "tikka", "masala", "naan", "chai", "dosa", "idli", "vada", "samosa", "kulfi", "gulab", "lassi", "pav", "chaat", "tandoori", "butter chicken", "dal", "kebab", "korma", "filter coffee", "indian"],
  hyderabadi: ["biryani", "haleem", "mandi", "irani chai", "osmania", "qubani", "double ka meetha", "kebab", "hyderabadi"],
  "south indian": ["dosa", "idli", "vada", "uttapam", "filter coffee", "pongal", "upma", "rasam", "sambar", "appam", "guntur"],
  "north indian": ["paneer", "naan", "butter chicken", "dal makhani", "tandoori", "kulcha", "chole", "lassi", "tikka"],
  italian: ["pizza", "pasta", "lasagna", "lasagne", "risotto", "tiramisu", "panna cotta", "bruschetta", "gelato", "ravioli", "gnocchi", "penne", "spaghetti", "carbonara", "arrabbiata", "pesto", "focaccia", "affogato", "italian"],
  french: ["croissant", "crepe", "crêpe", "quiche", "macaron", "creme brulee", "crème brûlée", "brulee", "eclair", "éclair", "baguette", "patisserie", "tart", "souffle", "french"],
  american: ["burger", "fries", "waffle", "pancake", "shake", "hot dog", "mac", "cheese", "wings", "nachos", "brownie", "cheesecake", "bbq", "barbeque", "steak", "onion rings", "sandwich", "american"],
  "new american": ["burger", "bowl", "waffle", "pancake", "cold brew", "avocado", "sourdough"],
  mexican: ["taco", "nacho", "burrito", "quesadilla", "salsa", "guacamole", "churro", "enchilada", "mexican", "fajita"],
  "tex mex": ["taco", "nacho", "burrito", "quesadilla", "fajita", "chili", "tex mex"],
  mediterranean: ["hummus", "falafel", "pita", "shawarma", "greek", "feta", "mezze", "tzatziki", "mediterranean", "baklava"],
  "middle eastern": ["shawarma", "falafel", "hummus", "kunafa", "knafeh", "baklava", "mandi", "kebab", "pita", "arabic"],
  lebanese: ["shawarma", "falafel", "hummus", "kunafa", "baklava", "fattoush", "tabbouleh"],
  arabian: ["mandi", "shawarma", "kunafa", "kabsa", "arabic", "falafel"],
  european: ["croissant", "quiche", "waffle", "pasta", "crepe", "schnitzel", "strudel", "tart", "european"],
  "modern european": ["croissant", "quiche", "risotto", "tart", "sourdough"],
  continental: ["pasta", "sandwich", "steak", "grilled", "quiche", "lasagna", "continental", "soup"],
  seafood: ["prawn", "fish", "shrimp", "crab", "calamari", "seafood", "lobster", "squid"],
  dessert: ["cake", "brownie", "cheesecake", "gelato", "ice cream", "tiramisu", "pastry", "waffle", "kunafa", "tres leches", "dessert", "mousse", "sundae"],
  bakery: ["bread", "croissant", "pastry", "cookie", "cake", "bun", "biscuit", "muffin", "puff"],
  cafe: ["coffee", "latte", "cappuccino", "cold brew", "frappe", "sandwich", "croissant", "cake"],
  coffee: ["coffee", "latte", "cappuccino", "espresso", "cold brew", "frappe", "mocha", "americano"],
  fusion: ["fusion", "naan pizza", "paneer pizza", "tikka pasta", "makhani pasta"],
  global: ["bowl", "fusion", "sushi", "taco", "pasta", "burger"],
  multicuisine: [],
};

const NON_VEG = [
  "chicken", "mutton", "lamb", "goat", "beef", "pork", "bacon", "ham", "salami", "pepperoni", "sausage",
  "fish", "prawn", "prawns", "shrimp", "crab", "lobster", "squid", "calamari", "tuna", "salmon", "seafood",
  "egg", "eggs", "omelette", "omelet", "keema", "kheema", "haleem", "mandi", "nihari", "paya", "turkey", "duck",
];

const ALCOHOL = ["beer", "wine", "cocktail", "cocktails", "whisky", "whiskey", "vodka", "rum", "gin", "tequila", "sangria", "margarita", "martini", "champagne", "prosecco", "ale", "lager", "stout", "sake", "soju", "mezcal", "bourbon", "spritz", "negroni", "liqueur"];
const DESSERT = ["cake", "cheesecake", "brownie", "gelato", "ice cream", "tiramisu", "pastry", "pastries", "waffle", "pancake", "kunafa", "tres leches", "dessert", "mousse", "sundae", "cookie", "donut", "doughnut", "macaron", "tart", "pie", "crepe", "kulfi", "halwa", "gulab", "jamun", "rasmalai", "sorbet", "custard", "pudding", "baklava", "churro", "shake", "affogato", "creme brulee", "brulee", "falooda", "mithai", "sweet", "chocolate", "nutella", "biscoff", "lovely", "holla"];

const hasWord = (dish: string, words: string[]) => {
  const nd = ` ${norm(dish)} `;
  return words.some((w) => {
    const k = norm(w);
    return nd.includes(` ${k} `) || nd.includes(` ${k}s `) || nd.includes(` ${k}es `);
  });
};

export const isAlcohol = (dish: string) => hasWord(dish, ALCOHOL);
export const isDessert = (dish: string) => hasWord(dish, DESSERT);

/** Keyword check, deliberately strict: anything that might contain meat or egg is treated as non-veg. */
export function isVeg(dish: string) {
  const nd = ` ${norm(dish)} `;
  return !NON_VEG.some((w) => nd.includes(` ${w} `) || nd.includes(` ${w}s `));
}

export type DishPick = {
  dish: string;
  matchedCuisine?: string;
  keyword?: string;
  kind: "taste_match" | "house_favourite";
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordsFor(cuisine: string): string[] {
  const k = norm(cuisine);
  return CUISINE_KEYWORDS[k] ?? [k];
}

/**
 * Pick one dish for one person.
 * cuisines: that person's Qloo cuisine affinities, strongest first.
 * dishes: the venue's Qloo menu highlights, in Qloo's order.
 * taken: dishes already given to someone else at the table (prefer variety).
 */
export function pickDish(
  cuisines: { name: string; affinity: number }[],
  allDishes: string[],
  taken: Set<string>,
  veg = false,
  occasion?: string,
): DishPick | undefined {
  // Never default anyone to a drink with alcohol; respect vegetarians strictly.
  let dishes = allDishes.filter((d) => !isAlcohol(d) && (!veg || isVeg(d)));
  // A dessert outing should land on a dessert when the venue has one.
  if (occasion === "dessert") {
    const sweet = dishes.filter(isDessert);
    if (sweet.length) dishes = sweet;
  }
  if (!dishes.length) return undefined;
  const scored: { dish: string; score: number; cuisine: string; keyword: string }[] = [];
  for (const d of dishes) {
    const nd = ` ${norm(d)} `;
    for (let i = 0; i < Math.min(cuisines.length, 8); i++) {
      const c = cuisines[i];
      for (const kw of keywordsFor(c.name)) {
        const k = norm(kw);
        if (!k) continue;
        // whole words only, allowing a simple plural ("taco" matches "tacos", "mac" never matches "macaron")
        if (nd.includes(` ${k} `) || nd.includes(` ${k}s `) || nd.includes(` ${k}es `)) {
          // stronger cuisine affinity wins; earlier rank breaks ties
          scored.push({ dish: d, score: c.affinity - i * 0.01, cuisine: c.name, keyword: kw });
          break;
        }
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const fresh = scored.find((s) => !taken.has(s.dish));
  const best = fresh ?? scored[0];
  if (best) return { dish: best.dish, matchedCuisine: best.cuisine, keyword: best.keyword, kind: "taste_match" };
  const house = dishes.find((d) => !taken.has(d)) ?? dishes[0];
  return { dish: house, kind: "house_favourite" };
}
