/** Time helpers that respect an explicit IANA zone instead of the browser's local zone. */

const hourFormatters = new Map<string, Intl.DateTimeFormat>();

function localHour(ts: number, timeZone: string): number {
  let f = hourFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' });
    hourFormatters.set(timeZone, f);
  }
  return Number(f.format(new Date(ts * 1000)));
}

/**
 * Tick positions aligned to local wall-clock hours divisible by `stepHours` (e.g. 00:00 and 12:00).
 * Works on hour boundaries, which is exact for every zone used here (all whole-hour offsets).
 */
export function alignedTicks(from: number, to: number, stepHours: number, timeZone: string): number[] {
  const ticks: number[] = [];
  let t = Math.ceil(from / 3600) * 3600;
  for (; t <= to; t += 3600) {
    if (localHour(t, timeZone) % stepHours === 0) ticks.push(t);
  }
  return ticks;
}

export function tickStepHours(spanHours: number): number {
  if (spanHours <= 36) return 6;
  if (spanHours <= 96) return 12;
  return 24;
}

export function formatTick(ts: number, timeZone: string, stepHours: number): string {
  const d = new Date(ts * 1000);
  const hour = localHour(ts, timeZone);
  if (stepHours >= 24 || hour === 0) {
    return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric' }).format(d);
  }
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatDateTime(ts: number, timeZone: string, daily = false): string {
  return new Intl.DateTimeFormat(
    'en-GB',
    daily
      ? { timeZone, weekday: 'short', day: 'numeric', month: 'short' }
      : { timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
  ).format(new Date(ts * 1000));
}

export function formatAge(seconds: number | null): string {
  if (seconds === null) return 'unknown';
  if (seconds < 90) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(seconds / 3600);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}
