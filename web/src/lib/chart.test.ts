import { describe, expect, it } from 'vitest';
import type { Point } from '../api';
import { allTimes, nearestIndex, splitAt, spreadLabels, yDomain } from './chart';
import { alignedTicks, formatAge, tickStepHours } from './time';

describe('yDomain', () => {
  it('starts at zero and leaves headroom above the data', () => {
    expect(
      yDomain(
        [
          [
            [0, 12.3],
            [1, 18.9],
          ],
        ],
        null,
      ),
    ).toEqual([0, 20]);
  });
  it('always includes the guideline so the reference line is visible', () => {
    expect(yDomain([[[0, 3]]], 15)[1]).toBeGreaterThanOrEqual(15);
  });
  it('ignores gaps and handles empty data', () => {
    expect(yDomain([[[0, null]]], null)).toEqual([0, 10]);
  });
});

describe('splitAt', () => {
  it('shares the boundary point so past and forecast lines join', () => {
    const pts: Point[] = [
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    const { past, future } = splitAt(pts, 2);
    expect(past.at(-1)).toEqual([2, 2]);
    expect(future[0]).toEqual([2, 2]);
  });
  it('bridges a boundary that falls between points', () => {
    const { future } = splitAt(
      [
        [1, 1],
        [3, 3],
      ],
      2,
    );
    expect(future).toEqual([
      [1, 1],
      [3, 3],
    ]);
  });
});

describe('nearestIndex', () => {
  const times = [0, 3600, 7200, 10800];
  it.each([
    [-50, 0],
    [1700, 0],
    [1900, 1],
    [99999, 3],
  ])('nearest to %i is index %i', (t, idx) => expect(nearestIndex(times, t)).toBe(idx));
  it('returns -1 for no data', () => expect(nearestIndex([], 5)).toBe(-1));
});

describe('time axis', () => {
  it('aligns ticks to local midnight and noon in the display zone', () => {
    // 2026-10-01 00:00 Asia/Jerusalem is 2026-09-30 21:00 UTC.
    const start = Date.UTC(2026, 8, 30, 20) / 1000;
    const ticks = alignedTicks(start, start + 26 * 3600, 12, 'Asia/Jerusalem');
    expect(ticks.map((t) => new Date(t * 1000).getUTCHours())).toEqual([21, 9, 21]);
  });
  it('chooses coarser steps for longer windows', () => {
    expect(tickStepHours(24)).toBe(6);
    expect(tickStepHours(72)).toBe(12);
    expect(tickStepHours(240)).toBe(24);
  });
  it('formats data age for people', () => {
    expect(formatAge(30)).toBe('just now');
    expect(formatAge(1500)).toBe('25 min ago');
    expect(formatAge(7200)).toBe('2 h ago');
    expect(formatAge(5 * 86400)).toBe('5 days ago');
  });
  it('merges timestamps across series', () => {
    expect(
      allTimes([
        [
          [3, 1],
          [1, 1],
        ],
        [
          [2, null],
          [3, 2],
        ],
      ]),
    ).toEqual([1, 2, 3]);
  });
});

describe('spreadLabels', () => {
  it('separates labels that would overlap and keeps their order', () => {
    const ys = spreadLabels([100, 102, 101, 300], 15, 0, 400);
    const sorted = [...ys].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]! - sorted[i - 1]!).toBeGreaterThanOrEqual(15);
    expect(ys[0]).toBe(100);
    expect(ys[3]).toBe(300);
  });
  it('shifts the stack up instead of running off the bottom', () => {
    const ys = spreadLabels([395, 396, 397], 15, 0, 400);
    expect(Math.max(...ys)).toBeLessThanOrEqual(400);
  });
});
