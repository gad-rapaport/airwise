import type { Point } from '../api';

/** Colour-blind-safe series palette (Okabe-Ito hues, darkened to >= 4.5:1 on white so they also work as text). */
export const SERIES_COLORS = ['#0a62a6', '#c4510a', '#0b7a5c', '#9b3f86'] as const;
export const SERIES_MARKERS = ['circle', 'square', 'triangle', 'diamond'] as const;
export type Marker = (typeof SERIES_MARKERS)[number];

/** Y domain from zero to a rounded maximum that always leaves room for the guideline line. */
export function yDomain(series: Point[][], guideline: number | null): [number, number] {
  let max = guideline ?? 0;
  for (const points of series) for (const [, v] of points) if (v !== null && v > max) max = v;
  if (max <= 0) return [0, 10];
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const nice = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * magnitude).find((v) => v >= max * 1.05);
  return [0, nice ?? max * 1.1];
}

/** Splits points into the part up to `boundary` and the part from `boundary` on (sharing the boundary point). */
export function splitAt(points: Point[], boundary: number): { past: Point[]; future: Point[] } {
  const past = points.filter(([t]) => t <= boundary);
  const future = points.filter(([t]) => t >= boundary);
  if (past.length && future.length && future[0]![0] !== past[past.length - 1]![0]) {
    future.unshift(past[past.length - 1]!);
  }
  return { past, future };
}

/** Index of the timestamp closest to `t` in an ascending list (binary search). */
export function nearestIndex(times: number[], t: number): number {
  if (times.length === 0) return -1;
  let lo = 0;
  let hi = times.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! < t) lo = mid;
    else hi = mid;
  }
  return Math.abs(times[lo]! - t) <= Math.abs(times[hi]! - t) ? lo : hi;
}

/** Union of all timestamps across series, ascending. Used for the table and the keyboard cursor. */
export function allTimes(series: Point[][]): number[] {
  const set = new Set<number>();
  for (const points of series) for (const [t] of points) set.add(t);
  return [...set].sort((a, b) => a - b);
}

export function valueAt(points: Point[], t: number): number | null {
  const hit = points.find(([pt]) => pt === t);
  return hit ? hit[1] : null;
}

/**
 * Vertical positions for end-of-line labels so they never overlap: sort by desired y, then push each label
 * at least gap px below the previous one, and shift the stack up if it runs past maxY.
 */
export function spreadLabels(desired: number[], gap: number, minY: number, maxY: number): number[] {
  const order = desired.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const placed: number[] = [];
  for (const [k, item] of order.entries()) {
    placed[k] = Math.max(item.y, k === 0 ? minY : placed[k - 1]! + gap);
  }
  const overflow = (placed.at(-1) ?? 0) - maxY;
  if (overflow > 0) for (let k = 0; k < placed.length; k++) placed[k] = Math.max(minY, placed[k]! - overflow);
  const result = new Array<number>(desired.length);
  order.forEach((item, k) => (result[item.i] = placed[k]!));
  return result;
}

export function formatValue(v: number | null, unit: string): string {
  if (v === null) return 'no data';
  return unit === 'index' ? String(Math.round(v)) : v.toFixed(1);
}
