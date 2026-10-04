import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { scaleLinear, scaleTime } from 'd3-scale';
import { line } from 'd3-shape';
import type { Point, SeriesResponse } from '../api';
import {
  allTimes,
  formatValue,
  nearestIndex,
  SERIES_COLORS,
  SERIES_MARKERS,
  splitAt,
  spreadLabels,
  valueAt,
  yDomain,
} from '../lib/chart';
import type { Marker } from '../lib/chart';
import { alignedTicks, formatDateTime, formatTick, tickStepHours } from '../lib/time';

const HEIGHT = 340;
const M = { top: 30, right: 96, bottom: 36, left: 48 };

export function MarkerShape({
  shape,
  x,
  y,
  color,
  size = 4,
}: {
  shape: Marker;
  x: number;
  y: number;
  color: string;
  size?: number;
}) {
  switch (shape) {
    case 'circle':
      return <circle cx={x} cy={y} r={size} fill={color} />;
    case 'square':
      return <rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={color} />;
    case 'triangle':
      return (
        <path
          d={`M${x},${y - size * 1.2}L${x + size * 1.1},${y + size * 0.8}L${x - size * 1.1},${y + size * 0.8}Z`}
          fill={color}
        />
      );
    case 'diamond':
      return (
        <path
          d={`M${x},${y - size * 1.25}L${x + size * 1.25},${y}L${x},${y + size * 1.25}L${x - size * 1.25},${y}Z`}
          fill={color}
        />
      );
  }
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(300, Math.floor(entry.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Multi-series line chart. Past values are solid, forecast values dashed; the WHO guideline is a labelled
 * reference line. Pointer hover and arrow keys move one cursor whose values are read out in a live region.
 */
export function LineChart({ data }: { data: SeriesResponse }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const descId = useId();
  const tz = data.timezone;
  const daily = data.resolution === 'daily';
  const times = useMemo(() => allTimes(data.series.map((s) => s.points)), [data]);
  const [cursor, setCursor] = useState<number | null>(null);
  const compact = width < 520;
  const margin = { ...M, right: compact ? 16 : M.right };

  const x = scaleTime()
    .domain([new Date(data.from * 1000), new Date(Math.max(data.to, data.from + 3600) * 1000)])
    .range([margin.left, width - margin.right]);
  const [y0, y1] = yDomain(
    data.series.map((s) => s.points),
    data.metric.guideline,
  );
  const y = scaleLinear()
    .domain([y0, y1])
    .range([HEIGHT - margin.bottom, margin.top]);
  const xs = (t: number) => x(new Date(t * 1000));
  const path = line<Point>()
    .defined(([, v]) => v !== null)
    .x(([t]) => xs(t))
    .y(([, v]) => y(v ?? 0));

  const spanHours = (data.to - data.from) / 3600;
  const step = daily ? 24 : tickStepHours(spanHours) * (compact && spanHours > 36 ? 2 : 1);
  const xTicks = alignedTicks(data.from, data.to, Math.min(step, 24), tz).filter(
    (_, i) => step <= 24 || i % (step / 24) === 0,
  );
  const yTicks = y.ticks(5);
  const nowX = xs(data.now);
  const showNow = data.now > data.from && data.now < data.to;
  const cursorTime = cursor !== null ? times[cursor] : undefined;
  const lastValues = data.series.map((s) => [...s.points].reverse().find(([, v]) => v !== null));
  const labelYs = spreadLabels(
    lastValues.map((p) => (p ? y(p[1]!) : margin.top)),
    15,
    margin.top,
    HEIGHT - margin.bottom,
  );

  function moveTo(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    const t = x.invert(((clientX - rect.left) / rect.width) * width).getTime() / 1000;
    setCursor(nearestIndex(times, t));
  }

  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (!times.length) return;
    const current = cursor ?? times.length - 1;
    const jump = daily ? 1 : 24;
    const next =
      e.key === 'ArrowRight'
        ? current + 1
        : e.key === 'ArrowLeft'
          ? current - 1
          : e.key === 'PageUp'
            ? current + jump
            : e.key === 'PageDown'
              ? current - jump
              : e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? times.length - 1
                  : null;
    if (next === null) return;
    e.preventDefault();
    setCursor(Math.min(times.length - 1, Math.max(0, next)));
  }

  const readout =
    cursorTime !== undefined
      ? `${formatDateTime(cursorTime, tz, daily)}${cursorTime > data.forecastFrom ? ' (forecast)' : ''}: ` +
        data.series
          .map((s) => `${s.name} ${formatValue(valueAt(s.points, cursorTime), data.metric.unit)}`)
          .join(', ')
      : '';

  return (
    <div className="chart" ref={wrapRef}>
      <svg
        className="chart__svg"
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-labelledby={descId}
        tabIndex={0}
        onKeyDown={onKey}
        onPointerMove={(e: PointerEvent<SVGSVGElement>) => moveTo(e.clientX, e.currentTarget)}
        onPointerLeave={() => setCursor(null)}
        onBlur={() => setCursor(null)}
      >
        <title id={descId}>
          {`${data.metric.label} for ${data.series.map((s) => s.name).join(', ')}, ${daily ? 'daily means' : 'hourly values'} from ${formatDateTime(data.from, tz)} to ${formatDateTime(data.to, tz)}. Use the arrow keys to read values, or switch to the table view.`}
        </title>
        {showNow && data.to > data.now && (
          <g aria-hidden="true">
            <rect
              x={nowX}
              y={margin.top}
              width={width - margin.right - nowX}
              height={HEIGHT - margin.top - margin.bottom}
              className="chart__forecast"
            />
            <text x={nowX + 6} y={margin.top + 12} className="chart__note">
              Forecast
            </text>
          </g>
        )}
        <g aria-hidden="true">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={margin.left} x2={width - margin.right} y1={y(t)} y2={y(t)} className="chart__grid" />
              <text
                x={margin.left - 8}
                y={y(t)}
                className="chart__tick"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {t}
              </text>
            </g>
          ))}
          <text x={4} y={margin.top - 14} className="chart__unit" textAnchor="start">
            {data.metric.unit}
          </text>
          {xTicks.map((t) => (
            <g key={t}>
              <line
                x1={xs(t)}
                x2={xs(t)}
                y1={HEIGHT - margin.bottom}
                y2={HEIGHT - margin.bottom + 5}
                className="chart__axis"
              />
              <text x={xs(t)} y={HEIGHT - margin.bottom + 18} className="chart__tick" textAnchor="middle">
                {formatTick(t, tz, step)}
              </text>
            </g>
          ))}
          <line
            x1={margin.left}
            x2={width - margin.right}
            y1={HEIGHT - margin.bottom}
            y2={HEIGHT - margin.bottom}
            className="chart__axis"
          />
          {data.metric.guideline !== null && (
            <g>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y(data.metric.guideline)}
                y2={y(data.metric.guideline)}
                className="chart__guideline"
              />
              <text x={margin.left + 6} y={y(data.metric.guideline) - 6} className="chart__note">
                WHO guideline {data.metric.guideline} ({data.metric.guidelinePeriod})
              </text>
            </g>
          )}
          {showNow && (
            <line x1={nowX} x2={nowX} y1={margin.top} y2={HEIGHT - margin.bottom} className="chart__now" />
          )}
        </g>

        {data.series.map((s, i) => {
          const color = SERIES_COLORS[i % SERIES_COLORS.length]!;
          const labelY = labelYs[i] ?? 0;
          const { past, future } = splitAt(s.points, data.forecastFrom);
          const last = [...s.points].reverse().find(([, v]) => v !== null);
          return (
            <g key={s.locationId} aria-hidden="true">
              <path d={path(past) ?? ''} stroke={color} className="chart__line" />
              <path d={path(future) ?? ''} stroke={color} className="chart__line chart__line--forecast" />
              {daily &&
                s.points
                  .filter(([, v]) => v !== null)
                  .map(([t, v]) => (
                    <MarkerShape
                      key={t}
                      shape={SERIES_MARKERS[i]!}
                      x={xs(t)}
                      y={y(v!)}
                      color={color}
                      size={3.5}
                    />
                  ))}
              {last && (
                <>
                  <MarkerShape shape={SERIES_MARKERS[i]!} x={xs(last[0])} y={y(last[1]!)} color={color} />
                  {!compact && (
                    <text
                      x={xs(last[0]) + 9}
                      y={labelY}
                      className="chart__label"
                      fill={color}
                      dominantBaseline="middle"
                    >
                      {s.name}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}

        {cursorTime !== undefined && (
          <g aria-hidden="true">
            <line
              x1={xs(cursorTime)}
              x2={xs(cursorTime)}
              y1={margin.top}
              y2={HEIGHT - margin.bottom}
              className="chart__cursor"
            />
            {data.series.map((s, i) => {
              const v = valueAt(s.points, cursorTime);
              return v === null ? null : (
                <MarkerShape
                  key={s.locationId}
                  shape={SERIES_MARKERS[i]!}
                  x={xs(cursorTime)}
                  y={y(v)}
                  color={SERIES_COLORS[i]!}
                  size={5}
                />
              );
            })}
          </g>
        )}
      </svg>
      <p className="chart__readout" aria-live="polite">
        {readout || 'Point at the chart, or focus it and use the arrow keys, to read exact values.'}
      </p>
    </div>
  );
}
