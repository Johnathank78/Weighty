import { useId } from 'react';

export type ChartPoint = { day: number; kg: number };
export type BandPoint = { day: number; lo: number; hi: number };

type Props = {
  width: number;
  height: number;
  trend?: ChartPoint[];
  raw?: ChartPoint[];
  projection?: ChartPoint[];
  band?: BandPoint[];
  markers?: Array<{ day: number; kg: number; kind: 'start' | 'today' | 'target' }>;
  /** Solid main line (projection chart) instead of dashed projection. */
  projectionSolid?: boolean;
  label: string;
  domainDays?: [number, number];
  baselineKg?: number | undefined;
};

/** Lightweight SVG weight chart (no chart library). Data come from the engine; this only maps to pixels. */
export function WeightChart({ width, height, trend = [], raw = [], projection = [], band = [], markers = [], projectionSolid = false, label, domainDays, baselineKg }: Props) {
  const gradId = useId().replace(/:/g, '');
  const allKg = [...trend.map((p) => p.kg), ...raw.map((p) => p.kg), ...projection.map((p) => p.kg), ...band.flatMap((b) => [b.lo, b.hi]), ...markers.map((m) => m.kg), ...(baselineKg !== undefined ? [baselineKg] : [])];
  const allDays = [...trend, ...raw, ...projection].map((p) => p.day).concat(band.map((b) => b.day), markers.map((m) => m.day));
  if (allKg.length === 0) return null;
  const pad = 8;
  let minKg = Math.min(...allKg);
  let maxKg = Math.max(...allKg);
  if (maxKg - minKg < 1) {
    const mid = (maxKg + minKg) / 2;
    minKg = mid - 0.5;
    maxKg = mid + 0.5;
  }
  const spanKg = maxKg - minKg;
  minKg -= spanKg * 0.08;
  maxKg += spanKg * 0.08;
  const d0 = domainDays?.[0] ?? Math.min(...allDays);
  const d1 = domainDays?.[1] ?? Math.max(...allDays, d0 + 1);
  const x = (day: number) => pad + ((day - d0) / (d1 - d0 || 1)) * (width - 2 * pad);
  const y = (kg: number) => pad + ((maxKg - kg) / (maxKg - minKg)) * (height - 2 * pad);
  const path = (pts: ChartPoint[]) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const bandPath =
    band.length > 1
      ? `${band.map((b, i) => `${i === 0 ? 'M' : 'L'}${x(b.day).toFixed(1)},${y(b.hi).toFixed(1)}`).join(' ')} ${[...band]
          .reverse()
          .map((b) => `L${x(b.day).toFixed(1)},${y(b.lo).toFixed(1)}`)
          .join(' ')} Z`
      : '';
  const areaUnderTrend = trend.length > 1 ? `${path(trend)} L${x(trend[trend.length - 1]!.day).toFixed(1)},${height} L${x(trend[0]!.day).toFixed(1)},${height} Z` : '';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="chart" role="img" aria-label={label} style={{ height }}>
      <defs>
        <linearGradient id={`${gradId}a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF8162" stopOpacity=".22" />
          <stop offset="1" stopColor="#FF8162" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${gradId}l`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFB28F" />
          <stop offset="1" stopColor="#FF8162" />
        </linearGradient>
      </defs>
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="var(--line-strong)" strokeWidth="1" />
      {baselineKg !== undefined ? <line x1="0" y1={y(baselineKg)} x2={width} y2={y(baselineKg)} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 5" /> : null}
      {areaUnderTrend ? <path d={areaUnderTrend} fill={`url(#${gradId}a)`} /> : null}
      {bandPath ? <path d={bandPath} fill="#FF8162" opacity=".12" /> : null}
      {projection.length > 1 ? (
        projectionSolid ? (
          <path d={path(projection)} fill="none" stroke={`url(#${gradId}l)`} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" style={{ ['--dash' as string]: 1, animation: 'wDash 1.2s ease both' }} />
        ) : (
          <path d={path(projection)} fill="none" stroke="#FF8162" strokeWidth="2" strokeDasharray="4 5" opacity=".6" strokeLinecap="round" />
        )
      ) : null}
      {raw.map((p, i) => (
        <circle key={`r${i}`} cx={x(p.day)} cy={y(p.kg)} r="2.4" fill="var(--ink2)" opacity=".35" />
      ))}
      {trend.length > 1 ? <path d={path(trend)} fill="none" stroke={`url(#${gradId}l)`} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1" style={{ ['--dash' as string]: 1, animation: 'wDash 1.2s ease both' }} /> : null}
      {markers.map((m, i) =>
        m.kind === 'target' ? (
          <circle key={`m${i}`} cx={x(m.day)} cy={y(m.kg)} r="5" fill="none" stroke="#FF8162" strokeWidth="2.4" />
        ) : m.kind === 'today' ? (
          <g key={`m${i}`}>
            <circle cx={x(m.day)} cy={y(m.kg)} r="9" fill="#FF8162" opacity=".18" />
            <circle cx={x(m.day)} cy={y(m.kg)} r="5" fill="#FF8162" />
          </g>
        ) : (
          <circle key={`m${i}`} cx={x(m.day)} cy={y(m.kg)} r="5" fill="#FF8162" />
        ),
      )}
    </svg>
  );
}
