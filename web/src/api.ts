export type MetricId = 'pm2_5' | 'pm10' | 'nitrogen_dioxide' | 'ozone' | 'european_aqi';
export type FreshnessState = 'fresh' | 'aging' | 'stale' | 'expired' | 'snapshot' | 'empty';
export type Point = [number, number | null];

export interface Metric {
  id: MetricId;
  label: string;
  short: string;
  unit: string;
  guideline: number | null;
  guidelinePeriod: string | null;
}

export interface Catalog {
  regions: { id: string; name: string }[];
  locations: { id: string; name: string; region: string; latitude: number; longitude: number }[];
  metrics: Metric[];
  attribution: { text: string; url: string };
}

export interface Freshness {
  state: FreshnessState;
  source: 'live' | 'snapshot' | null;
  fetchedAt: number | null;
  ageS: number | null;
  refreshing: boolean;
  lastError: string | null;
  message: string;
}

export interface SeriesResponse {
  metric: Metric;
  resolution: 'hourly' | 'daily';
  from: number;
  to: number;
  now: number;
  forecastFrom: number;
  timezone: string;
  series: { locationId: string; name: string; points: Point[] }[];
  freshness: Freshness;
}

export interface SummaryItem {
  locationId: string;
  name: string;
  region: string;
  observedAt: number | null;
  values: Partial<Record<MetricId, number | null>>;
  eaqiBand: string | null;
  pm25Mean24h: number | null;
}

export interface StatusResponse {
  mode: 'live' | 'snapshot';
  provider: string;
  freshness: Freshness;
  circuit: 'closed' | 'open' | 'half_open' | 'n/a';
  blockedForS: number;
  callsLastMinute: number;
  callBudgetPerMinute: number;
  freshTtlS: number;
  refreshIntervalS: number;
  schedulerEnabled: boolean;
  history: {
    startedAt: number;
    finishedAt: number;
    reason: string;
    outcome: string;
    detail: string;
    attempts: number;
  }[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterS?: number,
  ) {
    super(message);
  }
}

export async function getJson<T>(path: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, signal, headers: { accept: 'application/json' } });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Airwise could not be reached. Check that the service is running.');
  }
  const body = (await res.json().catch(() => null)) as
    (T & { error?: { code: string; message: string; details?: { retryAfterS?: number } } }) | null;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? `Request failed (${res.status}).`,
      body?.error?.details?.retryAfterS,
    );
  }
  return body as T;
}
