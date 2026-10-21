/**
 * Sapor's voice. Quotes are verified against their sources (21 Oct 2026);
 * every other line is original.
 */

export const QUOTES: { text: string; who: string }[] = [
  { text: "One cannot think well, love well, sleep well, if one has not dined well.", who: "Virginia Woolf, A Room of One's Own" },
  { text: "There is no love sincerer than the love of food.", who: "George Bernard Shaw, Man and Superman" },
  { text: "Tell me what you eat: I will tell you what you are.", who: "Brillat-Savarin, 1825" },
  {
    text: "The discovery of a new dish does more for the happiness of mankind than the discovery of a star.",
    who: "Brillat-Savarin, 1825",
  },
  { text: "O taste and see.", who: "Psalm 34:8" },
  { text: "Hunger is the best sauce.", who: "Old proverb" },
];

/** Shown on the intro screen. One is picked per page load. */
export const INTRO_LINES = [
  "Hungry? Same.",
  "Setting the table.",
  "Pulling up chairs for everyone.",
  "No more 'anything is fine'.",
  "Warming up the tawa.",
  "Reading taste, not minds.",
];

/** Shown while the agent works. */
export const WORKING_LINES = [
  "Taste-testing thirty cafés so you don't have to.",
  "Asking Qloo what BTS fans order. Politely.",
  "Settling 'anything is fine' once and for all.",
  "Counting chairs. Counting cravings.",
  "Whisking up a shortlist.",
  "Dosa-ing the maths.",
  "Brewing something everyone can agree on.",
  "Nobody gets outvoted today.",
  "Plating up your options.",
];

/** The corner fortune. */
export const FORTUNES = [
  "You had me at extra cheese.",
  "Life is short. Look at the dessert menu first.",
  "Chai is not a drink. It is a decision.",
  "Behind every great table is a friend who booked it.",
  "The group chat can finally rest.",
  "Calories don't count when the plate is shared.",
  "Paneer pressure is real.",
  "Bao down to good taste.",
  "Lettuce celebrate. You picked a place.",
  "It's not overthinking. It's menu research.",
  "Good food, good company, nobody checking their phone. Two out of three is fine.",
  "Whoever says 'I'm not hungry' will eat half of your fries.",
];
