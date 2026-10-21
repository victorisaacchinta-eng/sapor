/**
 * How Sapor ranks venues for a table. Pure functions, no I/O, so they can be tested.
 *
 * Weakest person first. A venue's table score is mostly the match of the person
 * it suits least, then the table's average match, then Qloo's own affinity for
 * the venue (0..1, used as is). Real affinities among nearby candidates sit in a
 * narrow band (about 0.70 to 0.86 in our tests), so at 15% weight affinity only
 * breaks near ties. It can never move a score by more than 0.15, so it cannot
 * outweigh a gap of 25 points or more in the weakest person's match.
 *
 * An earlier version rescaled affinity across the candidates. That turned a 0.03
 * difference into a big swing and let affinity override fairness again; the live
 * case is kept in tests/score.test.ts.
 *
 * A match is not a probability that someone will enjoy the place. It says how
 * much of a person's Qloo taste profile the venue's own Qloo tags carry.
 */

export const WEIGHTS = { lowest: 0.6, mean: 0.25, affinity: 0.15 } as const;

export type Scored = { id: string; name: string; fits: number[]; affinity: number };

export function tableScore(fits: number[], affinity: number) {
  if (!fits.length) return 0;
  const mean = fits.reduce((a, b) => a + b, 0) / fits.length;
  const low = Math.min(...fits);
  return WEIGHTS.lowest * low + WEIGHTS.mean * mean + WEIGHTS.affinity * clamp01(affinity);
}

/** Rank venues; ties go to the better weakest match, then the better average, then name, so runs are stable. */
export function rank<T extends Scored>(venues: T[]): (T & { tableScore: number; lowest: number; mean: number })[] {
  return venues
    .map((v) => {
      const mean = v.fits.length ? v.fits.reduce((a, b) => a + b, 0) / v.fits.length : 0;
      const lowest = v.fits.length ? Math.min(...v.fits) : 0;
      return { ...v, tableScore: tableScore(v.fits, v.affinity), lowest, mean };
    })
    .sort((a, b) => b.tableScore - a.tableScore || b.lowest - a.lowest || b.mean - a.mean || a.name.localeCompare(b.name));
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
