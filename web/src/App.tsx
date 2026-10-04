import { useCallback, useEffect, useState } from 'react';
import type { Catalog, MetricId, SeriesResponse, StatusResponse, SummaryItem } from './api';
import { ApiError, getJson } from './api';
import { LineChart } from './components/LineChart';
import { DataTable, FreshnessBanner, Legend, StatusPanel, SummaryGrid } from './components/Panels';

const MAX_LOCATIONS = 4;
const WINDOWS = [
  { hours: 24, label: '24 hours' },
  { hours: 72, label: '3 days' },
  { hours: 168, label: '7 days' },
] as const;

interface ViewState {
  metric: MetricId;
  locations: string[];
  hours: number;
  forecast: boolean;
  resolution: 'hourly' | 'daily';
  view: 'chart' | 'table';
  region: string;
}

const DEFAULTS: ViewState = {
  metric: 'pm2_5',
  locations: ['tel-aviv', 'jerusalem', 'haifa', 'athens'],
  hours: 72,
  forecast: true,
  resolution: 'hourly',
  view: 'chart',
  region: 'all',
};

function readUrl(): ViewState {
  const p = new URLSearchParams(window.location.search);
  const hours = Number(p.get('hours'));
  return {
    metric: (p.get('metric') as MetricId | null) ?? DEFAULTS.metric,
    locations: p.get('locations')?.split(',').filter(Boolean).slice(0, MAX_LOCATIONS) ?? DEFAULTS.locations,
    hours: [24, 72, 168].includes(hours) ? hours : DEFAULTS.hours,
    forecast: p.get('forecast') !== 'false',
    resolution: p.get('resolution') === 'daily' ? 'daily' : 'hourly',
    view: p.get('view') === 'table' ? 'table' : 'chart',
    region: p.get('region') ?? 'all',
  };
}

function writeUrl(s: ViewState) {
  const p = new URLSearchParams({
    metric: s.metric,
    locations: s.locations.join(','),
    hours: String(s.hours),
    forecast: String(s.forecast),
    resolution: s.resolution,
    view: s.view,
    region: s.region,
  });
  window.history.replaceState(null, '', `?${p.toString()}`);
}

type Load<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ok'; data: T };

export function App() {
  const [state, setState] = useState<ViewState>(readUrl);
  const [catalog, setCatalog] = useState<Load<Catalog>>({ status: 'loading' });
  const [series, setSeries] = useState<Load<SeriesResponse>>({ status: 'loading' });
  const [summary, setSummary] = useState<SummaryItem[] | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const update = (patch: Partial<ViewState>) => setState((s) => ({ ...s, ...patch }));
  useEffect(() => writeUrl(state), [state]);

  useEffect(() => {
    const c = new AbortController();
    getJson<Catalog>('/api/catalog', c.signal).then(
      (data) => setCatalog({ status: 'ok', data }),
      (err: unknown) => !c.signal.aborted && setCatalog({ status: 'error', error: (err as Error).message }),
    );
    return () => c.abort();
  }, []);

  useEffect(() => {
    if (state.locations.length === 0) return;
    const c = new AbortController();
    setSeries((prev) => (prev.status === 'ok' ? prev : { status: 'loading' }));
    const q = new URLSearchParams({
      locations: state.locations.join(','),
      metric: state.metric,
      hours: String(state.hours),
      forecast: String(state.forecast),
      resolution: state.resolution,
    });
    getJson<SeriesResponse>(`/api/series?${q}`, c.signal).then(
      (data) => setSeries({ status: 'ok', data }),
      (err: unknown) => {
        if (c.signal.aborted) return;
        setSeries({
          status: 'error',
          error: err instanceof ApiError ? err.message : 'Data could not be loaded.',
        });
      },
    );
    return () => c.abort();
  }, [state.locations, state.metric, state.hours, state.forecast, state.resolution, reloadKey]);

  const loadSide = useCallback(() => {
    getJson<{ items: SummaryItem[] }>('/api/summary').then(
      (r) => setSummary(r.items),
      () => setSummary(null),
    );
    getJson<StatusResponse>('/api/status').then(setStatus, () => setStatus(null));
  }, []);
  useEffect(loadSide, [loadSide, reloadKey]);

  if (catalog.status === 'loading') return <p className="state">Loading Airwise…</p>;
  if (catalog.status === 'error') {
    return (
      <div className="state state--error" role="alert">
        <p>{catalog.error}</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }
  const cat = catalog.data;
  const visibleLocations = cat.locations.filter((l) => state.region === 'all' || l.region === state.region);
  const atLimit = state.locations.length >= MAX_LOCATIONS;
  const tz = series.status === 'ok' ? series.data.timezone : 'Asia/Jerusalem';

  function toggleLocation(id: string, on: boolean) {
    const next = on ? [...state.locations, id] : state.locations.filter((l) => l !== id);
    update({ locations: next });
  }

  return (
    <div className="page">
      <a href="#main" className="skip-link">
        Skip to chart
      </a>
      <header className="masthead">
        <div className="masthead__inner">
          <p className="brand">
            <svg viewBox="0 0 32 32" aria-hidden="true" className="brand__mark">
              <rect width="32" height="32" rx="16" />
              <path d="M7 13c4-3 7 3 11 0s5-2 7-1M7 19c4-3 7 3 11 0s5-2 7-1" />
            </svg>
            Airwise
          </p>
          <p className="masthead__tag">Air quality across Israel and the Eastern Mediterranean</p>
        </div>
      </header>

      <div className="layout">
        <aside className="controls" id="settings" aria-label="Chart settings">
          <form onSubmit={(e) => e.preventDefault()}>
            <fieldset>
              <legend>Pollutant</legend>
              {cat.metrics.map((m) => (
                <label key={m.id} className="choice">
                  <input
                    type="radio"
                    name="metric"
                    value={m.id}
                    checked={state.metric === m.id}
                    onChange={() => update({ metric: m.id })}
                  />
                  <span>
                    {m.short}
                    <span className="choice__hint">{m.label}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>Time window</legend>
              <div className="segmented">
                {WINDOWS.map((w) => (
                  <label key={w.hours}>
                    <input
                      type="radio"
                      name="hours"
                      checked={state.hours === w.hours}
                      onChange={() => update({ hours: w.hours })}
                    />
                    <span>{w.label}</span>
                  </label>
                ))}
              </div>
              <label className="choice choice--inline">
                <input
                  type="checkbox"
                  checked={state.forecast}
                  onChange={(e) => update({ forecast: e.target.checked })}
                />
                <span>Include forecast</span>
              </label>
              <div className="segmented" role="group" aria-label="Resolution">
                {(['hourly', 'daily'] as const).map((r) => (
                  <label key={r}>
                    <input
                      type="radio"
                      name="resolution"
                      checked={state.resolution === r}
                      onChange={() => update({ resolution: r })}
                    />
                    <span>{r === 'hourly' ? 'Hourly' : 'Daily mean'}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Locations</legend>
              <label className="select">
                <span>Region</span>
                <select value={state.region} onChange={(e) => update({ region: e.target.value })}>
                  <option value="all">All regions</option>
                  {cat.regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="hint" id="loc-hint">
                Compare up to {MAX_LOCATIONS}. {state.locations.length} selected.
              </p>
              {visibleLocations.map((l) => {
                const checked = state.locations.includes(l.id);
                return (
                  <label key={l.id} className="choice">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!checked && atLimit}
                      aria-describedby="loc-hint"
                      onChange={(e) => toggleLocation(l.id, e.target.checked)}
                    />
                    <span>{l.name}</span>
                  </label>
                );
              })}
            </fieldset>
          </form>
        </aside>

        <main id="main" className="main" tabIndex={-1}>
          {series.status === 'ok' && <FreshnessBanner f={series.data.freshness} timezone={tz} />}

          <section className="panel" aria-labelledby="chart-heading">
            <div className="panel__head">
              <div>
                <h1 id="chart-heading">
                  {series.status === 'ok' ? series.data.metric.label : 'Air quality'}
                </h1>
                <p className="panel__sub">
                  {state.resolution === 'daily' ? 'Daily means' : 'Hourly values'}, times in {tz}
                  {series.status === 'ok' &&
                    series.data.metric.unit !== 'index' &&
                    ` · ${series.data.metric.unit}`}
                </p>
              </div>
              <a href="#settings" className="settings-link">
                Change pollutant, window or places
              </a>
              <div className="segmented segmented--view" role="group" aria-label="View">
                {(['chart', 'table'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={state.view === v}
                    onClick={() => update({ view: v })}
                  >
                    {v === 'chart' ? 'Chart' : 'Table'}
                  </button>
                ))}
              </div>
            </div>

            {state.locations.length === 0 ? (
              <p className="state">Choose at least one location to see data.</p>
            ) : series.status === 'loading' ? (
              <p className="state" role="status">
                Loading data…
              </p>
            ) : series.status === 'error' ? (
              <div className="state state--error" role="alert">
                <p>{series.error}</p>
                <button type="button" className="btn" onClick={() => setReloadKey((k) => k + 1)}>
                  Try again
                </button>
              </div>
            ) : (
              <>
                <Legend data={series.data} />
                {state.view === 'chart' ? <LineChart data={series.data} /> : <DataTable data={series.data} />}
                {series.data.metric.guideline !== null && (
                  <p className="footnote">
                    The WHO {series.data.metric.guidelinePeriod} guideline is shown for orientation; hourly
                    values above it do not by themselves mean the guideline was exceeded.
                  </p>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="now-heading" className="now">
            <h2 id="now-heading">Latest European Air Quality Index</h2>
            {summary ? (
              <SummaryGrid
                items={summary.filter((s) => state.region === 'all' || s.region === state.region)}
                catalog={cat}
                timezone={tz}
              />
            ) : (
              <p className="state">Summary not available.</p>
            )}
          </section>

          {status && <StatusPanel status={status} onRefreshed={() => setReloadKey((k) => k + 1)} />}

          <footer className="footer">
            <p>
              {cat.attribution.text}{' '}
              <a href={cat.attribution.url} rel="noreferrer" target="_blank">
                Provider documentation
              </a>
              .
            </p>
            <p className="muted">
              Model data (CAMS forecasts and analyses), not measurements from monitoring stations.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
