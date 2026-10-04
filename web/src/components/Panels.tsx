import { useState } from 'react';
import type { Catalog, Freshness, SeriesResponse, StatusResponse, SummaryItem } from '../api';
import { ApiError, getJson } from '../api';
import { allTimes, formatValue, SERIES_COLORS, SERIES_MARKERS, valueAt } from '../lib/chart';
import { formatAge, formatDateTime } from '../lib/time';
import { MarkerShape } from './LineChart';

const STATE_LABEL: Record<Freshness['state'], string> = {
  fresh: 'Live',
  aging: 'Live, refresh due',
  stale: 'Saved data',
  expired: 'Outdated',
  snapshot: 'Offline snapshot',
  empty: 'No data',
};

export function FreshnessBanner({ f, timezone }: { f: Freshness; timezone: string }) {
  const when = f.fetchedAt ? formatDateTime(Math.round(f.fetchedAt), timezone) : null;
  return (
    <div className={`fresh fresh--${f.state}`} role="status">
      <span className="fresh__state">
        <span className="fresh__dot" aria-hidden="true" />
        {STATE_LABEL[f.state]}
      </span>
      <span className="fresh__text">
        {f.state === 'snapshot'
          ? `Captured ${when}. `
          : when
            ? `Updated ${formatAge(f.ageS)} (${when}). `
            : ''}
        {f.message}
        {f.refreshing && ' Fetching newer data in the background.'}
        {f.lastError && f.state !== 'fresh' && (
          <span className="fresh__error"> Last provider error: {f.lastError}.</span>
        )}
      </span>
    </div>
  );
}

export function Legend({ data }: { data: SeriesResponse }) {
  return (
    <ul className="legend" aria-label="Locations in the chart">
      {data.series.map((s, i) => (
        <li key={s.locationId}>
          <svg width="28" height="14" aria-hidden="true">
            <line x1="0" x2="28" y1="7" y2="7" stroke={SERIES_COLORS[i]} strokeWidth="2.5" />
            <MarkerShape shape={SERIES_MARKERS[i]!} x={14} y={7} color={SERIES_COLORS[i]!} />
          </svg>
          {s.name}
        </li>
      ))}
      <li className="legend__aux">
        <svg width="28" height="14" aria-hidden="true">
          <line x1="0" x2="28" y1="7" y2="7" className="legend__dash" />
        </svg>
        Forecast
      </li>
    </ul>
  );
}

export function DataTable({ data }: { data: SeriesResponse }) {
  const times = allTimes(data.series.map((s) => s.points));
  const daily = data.resolution === 'daily';
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label="Data table">
      <table className="table">
        <caption className="visually-hidden">
          {data.metric.label} in {data.metric.unit}, {daily ? 'daily means' : 'hourly values'}, times in{' '}
          {data.timezone}
        </caption>
        <thead>
          <tr>
            <th scope="col">Time ({data.timezone})</th>
            {data.series.map((s) => (
              <th key={s.locationId} scope="col" className="num">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {times.map((t) => (
            <tr key={t} className={t > data.forecastFrom ? 'is-forecast' : undefined}>
              <th scope="row">
                {formatDateTime(t, data.timezone, daily)}
                {t > data.forecastFrom && <span className="tag">forecast</span>}
              </th>
              {data.series.map((s) => {
                const v = valueAt(s.points, t);
                return (
                  <td key={s.locationId} className={`num${v === null ? ' muted' : ''}`}>
                    {v === null ? '—' : formatValue(v, data.metric.unit)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BAND_CLASS: Record<string, string> = {
  Good: 'good',
  Fair: 'fair',
  Moderate: 'moderate',
  Poor: 'poor',
  'Very poor': 'very-poor',
  'Extremely poor': 'extreme',
};

export function SummaryGrid({
  items,
  catalog,
  timezone,
}: {
  items: SummaryItem[];
  catalog: Catalog;
  timezone: string;
}) {
  const pm25 = catalog.metrics.find((m) => m.id === 'pm2_5');
  return (
    <ul className="cards">
      {items.map((item) => {
        const aqi = item.values.european_aqi ?? null;
        const over =
          pm25?.guideline !== null &&
          item.pm25Mean24h !== null &&
          item.pm25Mean24h > (pm25?.guideline ?? Infinity);
        return (
          <li key={item.locationId} className="card">
            <h3 className="card__title">{item.name}</h3>
            <p className="card__band">
              <span
                className={`band band--${BAND_CLASS[item.eaqiBand ?? ''] ?? 'none'}`}
                aria-hidden="true"
              />
              <span>
                <span className="card__aqi">{aqi === null ? '—' : Math.round(aqi)}</span> EAQI ·{' '}
                <strong>{item.eaqiBand ?? 'No data'}</strong>
              </span>
            </p>
            <p className="card__meta">
              PM2.5 24-h mean <span className="mono">{item.pm25Mean24h ?? '—'}</span> µg/m³
              {over && <span className="tag tag--warn">above WHO guideline</span>}
            </p>
            {item.observedAt && (
              <p className="card__meta muted">As of {formatDateTime(item.observedAt, timezone)}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function StatusPanel({ status, onRefreshed }: { status: StatusResponse; onRefreshed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const live = status.mode === 'live';

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await getJson<{ outcome: string; detail: string }>('/api/refresh', undefined, {
        method: 'POST',
      });
      setMessage(
        r.outcome === 'updated'
          ? 'Fresh data loaded from the provider.'
          : r.outcome === 'failed'
            ? `The provider did not answer (${r.detail}). Saved data stays on screen.`
            : r.detail,
      );
      onRefreshed();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Refresh failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="status">
      <summary>Data source and service status</summary>
      <dl className="facts">
        <dt>Mode</dt>
        <dd>{live ? 'Live provider with cache' : 'Offline snapshot (no provider calls)'}</dd>
        <dt>Provider</dt>
        <dd className="mono small">{status.provider}</dd>
        <dt>Connection</dt>
        <dd>
          {status.circuit === 'closed'
            ? 'Healthy'
            : status.circuit === 'open'
              ? `Paused after repeated failures, retry in ${Math.ceil(status.blockedForS)} s`
              : status.circuit === 'half_open'
                ? 'Trying again after a pause'
                : 'Not used'}
        </dd>
        <dt>Cache policy</dt>
        <dd>
          Fresh for {Math.round(status.freshTtlS / 60)} min; scheduled refresh every{' '}
          {Math.round(status.refreshIntervalS / 60)} min
          {status.schedulerEnabled ? '' : ' (scheduler off)'}
        </dd>
        <dt>Provider calls</dt>
        <dd>
          {status.callsLastMinute} in the last minute (local limit {status.callBudgetPerMinute})
        </dd>
      </dl>
      {status.history.length > 0 && (
        <table className="table table--compact">
          <caption>Recent refreshes</caption>
          <thead>
            <tr>
              <th scope="col">Finished</th>
              <th scope="col">Trigger</th>
              <th scope="col">Outcome</th>
              <th scope="col" className="num">
                Attempts
              </th>
            </tr>
          </thead>
          <tbody>
            {status.history.map((h) => (
              <tr key={h.finishedAt}>
                <td>{formatAge(Date.now() / 1000 - h.finishedAt)}</td>
                <td>{h.reason}</td>
                <td>
                  {h.outcome}
                  {h.outcome === 'failed' && <span className="muted small block">{h.detail}</span>}
                </td>
                <td className="num">{h.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="status__actions">
        <button type="button" className="btn" onClick={() => void refresh()} disabled={busy || !live}>
          {busy ? 'Refreshing…' : 'Refresh from provider'}
        </button>
        {!live && <span className="muted small">Disabled in snapshot mode.</span>}
        <p className="small" role="status">
          {message}
        </p>
      </div>
    </details>
  );
}
