import { useEffect, useMemo, useRef, useState } from 'react';
import { useEntryMotion } from '@/app/navigation';
import { axisLabels, chartScale } from '@/domain/chartScale';
import type { ChartScale, ChartScaleInput, DayBand, DayPoint, DaySpan, Marker } from '@/domain/chartScale';

export type ChartPoint = DayPoint;
export type BandPoint = DayBand;

type Props = {
  height: number;
  /** First and last day of the window (UX pass 3, point 1a: one time scale). Absent: the days of the data. */
  domainDays?: readonly [number, number];
  /** Day of "aujourd'hui" (UX pass 3, point 1b). Absent: the last trend point. */
  todayDay?: number;
  trend?: readonly DayPoint[];
  raw?: readonly DayPoint[];
  projection?: readonly DayPoint[];
  band?: readonly DayBand[];
  markers?: readonly Marker[];
  /** Tracking pauses (UX pass 3, point 1d): the trend is interrupted there, under a grey band. */
  pauses?: readonly DaySpan[];
  /** Read out in place of the drawing. */
  label: string;
  /** Longer text alternative: what the curve says, in words. */
  summary?: string;
  /** Labels under the chart: the first date, "Auj." at its real position, the last date. */
  axis?: { start: string; today: string; end?: string };
  /** Legend of the projection band, shown when a band is drawn (UX pass 1, G7). */
  bandLabel?: string;
};

const REVEAL_MS = 900;
const EMPTY: readonly never[] = [];

/**
 * Weight chart on a canvas (A3). The geometry comes from `chartScale`; this only paints it. UX pass 3, point 1f: the drawing
 * runs again only when what it draws changes (its data, its size, the theme), not on every render of the screen: a new
 * array with the same content keeps the drawing in place.
 */
export function WeightChart({ height, domainDays, todayDay, trend = EMPTY, raw = EMPTY, projection = EMPTY, band = EMPTY, markers = EMPTY, pauses = EMPTY, label, summary, axis, bandLabel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [theme, setTheme] = useState<string>(() => (typeof document === 'undefined' ? 'light' : (document.documentElement.dataset.theme ?? 'light')));
  // Drawn at once, without the progressive reveal, in a copy under a swipe and on the screen a swipe lands on (UX pass 2).
  const reveal = useEntryMotion();

  // The content of the drawing, as one string: the geometry and the drawing depend on it, not on the identity of the arrays.
  const dataKey = JSON.stringify({ ...(domainDays ? { domainDays } : {}), ...(todayDay !== undefined ? { todayDay } : {}), trend, raw, projection, band, markers, pauses });
  const scale = useMemo<ChartScale | null>(() => (width > 0 ? chartScale({ width, height, ...(JSON.parse(dataKey) as Omit<ChartScaleInput, 'width' | 'height'>) }) : null), [width, height, dataKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => setWidth(canvas.clientWidth);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(canvas);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // The drawing does not inherit CSS: colours are re-read whenever the theme changes.
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(root.dataset.theme ?? 'light'));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scale) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(scale.width * dpr);
    canvas.height = Math.round(scale.height * dpr);
    const css = getComputedStyle(canvas);
    const colors = {
      coral: css.getPropertyValue('--coral').trim() || '#ff8162',
      peach: css.getPropertyValue('--peach').trim() || '#ffb28f',
      ink2: css.getPropertyValue('--ink2').trim() || '#736d67',
      line: css.getPropertyValue('--line-strong').trim() || 'rgba(32,32,30,.14)',
    };
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let raf = 0;
    const t0 = performance.now();
    const frame = () => {
      const progress = reduced || !reveal ? 1 : Math.min(1, (performance.now() - t0) / REVEAL_MS);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, scale.width, scale.height);
      paint(ctx, scale, colors, 1 - Math.pow(1 - progress, 3));
      if (progress < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [scale, theme, reveal]);

  const todayRatio = scale?.todayRatio ?? 0.5;
  const edges = axisLabels(todayRatio);
  return (
    <>
      <canvas ref={canvasRef} className="chart" style={{ height }} role="img" aria-label={label}>
        {summary ?? label}
      </canvas>
      {summary ? <p className="sr-only">{summary}</p> : null}
      {axis ? (
        <div className="chart-axis" aria-hidden="true">
          <span style={edges.start ? undefined : { visibility: 'hidden' }}>{axis.start}</span>
          <span className="chart-axis__today" style={{ left: `${(todayRatio * 100).toFixed(1)}%` }}>
            {axis.today}
          </span>
          {axis.end ? <span style={edges.end ? { opacity: 0.6 } : { visibility: 'hidden' }}>{axis.end}</span> : null}
        </div>
      ) : null}
      {bandLabel && band.length > 1 ? (
        <p className="chart-legend" aria-hidden="true">
          <span className="chart-legend__swatch" />
          {bandLabel}
        </p>
      ) : null}
    </>
  );
}

type Colors = { coral: string; peach: string; ink2: string; line: string };

/** One frame. `progress` reveals the trend then the projection, left to right. */
function paint(ctx: CanvasRenderingContext2D, s: ChartScale, colors: Colors, progress: number): void {
  const { width, height } = s;
  const line = ctx.createLinearGradient(0, 0, width, 0);
  line.addColorStop(0, colors.peach);
  line.addColorStop(1, colors.coral);

  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(width, height - 0.5);
  ctx.stroke();

  // UX pass 3, point 1d: a discreet grey band over each pause, without text.
  if (s.pauses.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = colors.ink2;
    for (const p of s.pauses) if (p.x1 > p.x0) ctx.fillRect(p.x0, 0, p.x1 - p.x0, height - 1);
    ctx.restore();
  }

  // Today (UX pass 3, point 1a): a discreet vertical line at its real position; one scale, so it marks no change of scale.
  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(s.todayX, 2);
  ctx.lineTo(s.todayX, height - 1);
  ctx.stroke();
  ctx.restore();

  if (s.band.top.length > 1) {
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = colors.coral;
    ctx.beginPath();
    trace(ctx, s.band.top, 1);
    for (let i = s.band.bottom.length - 1; i >= 0; i--) {
      const p = s.band.bottom[i] as { x: number; y: number };
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // The area under the trend, one per tracking period (nothing under a pause).
  for (const segment of s.trendSegments) {
    if (segment.length < 2) continue;
    const area = ctx.createLinearGradient(0, 0, 0, height);
    area.addColorStop(0, withAlpha(colors.coral, 0.22));
    area.addColorStop(1, withAlpha(colors.coral, 0));
    ctx.fillStyle = area;
    ctx.beginPath();
    trace(ctx, segment, 1);
    const last = segment[segment.length - 1] as { x: number; y: number };
    const first = segment[0] as { x: number; y: number };
    ctx.lineTo(last.x, height);
    ctx.lineTo(first.x, height);
    ctx.closePath();
    ctx.fill();
  }

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = colors.ink2;
  for (const p of s.raw) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (s.projection.length > 1) {
    ctx.save();
    ctx.strokeStyle = colors.coral;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    trace(ctx, s.projection, progress);
    ctx.stroke();
    ctx.restore();
  }

  // The trend line, interrupted at each pause; revealed left to right over the whole history.
  const total = s.trend.length - 1;
  let before = 0;
  ctx.strokeStyle = line;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const segment of s.trendSegments) {
    const n = segment.length;
    if (n > 1 && total > 0) {
      const reach = progress * total - before;
      if (reach > 0) {
        ctx.beginPath();
        trace(ctx, segment, Math.min(1, reach / (n - 1)));
        ctx.stroke();
      }
    }
    before += n;
  }

  for (const m of s.markers) {
    if (m.kind === 'target') {
      ctx.strokeStyle = colors.coral;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    if (m.kind === 'today') {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = colors.coral;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = colors.coral;
    ctx.beginPath();
    ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Polyline up to `progress` of its length, cutting the last segment where it falls. */
function trace(ctx: CanvasRenderingContext2D, points: ReadonlyArray<{ x: number; y: number }>, progress: number): void {
  if (points.length === 0) return;
  const first = points[0] as { x: number; y: number };
  ctx.moveTo(first.x, first.y);
  const reach = Math.max(0, Math.min(1, progress)) * (points.length - 1);
  for (let i = 1; i < points.length; i++) {
    const p = points[i] as { x: number; y: number };
    if (i <= reach) {
      ctx.lineTo(p.x, p.y);
      continue;
    }
    const prev = points[i - 1] as { x: number; y: number };
    const t = reach - (i - 1);
    if (t > 0) ctx.lineTo(prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t);
    return;
  }
}

/** Alpha variant of a token colour (hex or rgb/rgba as the theme defines them). */
function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const c = hex[1] as string;
    const full = c.length === 3 ? [...c].map((d) => d + d).join('') : c;
    const n = Number.parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (rgb) {
    const parts = (rgb[1] as string).split(',').map((p) => p.trim());
    return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
  }
  return color;
}
