import { useEffect, useRef, useState } from 'react';
import { chartScale, FUTURE_WIDTH_SHARE } from '@/domain/chartScale';
import type { ChartScale, DayBand, DayPoint, Marker } from '@/domain/chartScale';

export type ChartPoint = DayPoint;
export type BandPoint = DayBand;

type Props = {
  height: number;
  trend?: readonly DayPoint[];
  raw?: readonly DayPoint[];
  projection?: readonly DayPoint[];
  band?: readonly DayBand[];
  markers?: readonly Marker[];
  /** Read out in place of the drawing. */
  label: string;
  /** Longer text alternative: what the curve says, in words. */
  summary?: string;
  /** Labels under the chart. "today" is placed on the junction, the same one the drawing uses. */
  axis?: { start: string; today: string; future?: string };
};

const REVEAL_MS = 900;

/** Weight chart on a canvas (A3). The geometry comes from `chartScale`; this only paints it. */
export function WeightChart({ height, trend = [], raw = [], projection = [], band = [], markers = [], label, summary, axis }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [theme, setTheme] = useState<string>(() => (typeof document === 'undefined' ? 'light' : (document.documentElement.dataset.theme ?? 'light')));
  const [scale, setScale] = useState<ChartScale | null>(null);

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
    if (!canvas || width <= 0) return;
    const geometry = chartScale({ width, height, trend, raw, projection, band, markers });
    setScale(geometry);
    const ctx = canvas.getContext('2d');
    if (!ctx || !geometry) return;
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
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
      const progress = reduced ? 1 : Math.min(1, (performance.now() - t0) / REVEAL_MS);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      paint(ctx, geometry, colors, 1 - Math.pow(1 - progress, 3));
      if (progress < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, theme, trend, raw, projection, band, markers]);

  const todayRatio = scale?.todayRatio ?? 1 - FUTURE_WIDTH_SHARE;
  return (
    <>
      <canvas ref={canvasRef} className="chart" style={{ height }} role="img" aria-label={label}>
        {summary ?? label}
      </canvas>
      {summary ? <p className="sr-only">{summary}</p> : null}
      {axis ? (
        <div className="chart-axis" aria-hidden="true">
          <span>{axis.start}</span>
          {axis.future ? (
            <>
              <span className="chart-axis__today" style={{ left: `${(todayRatio * 100).toFixed(1)}%` }}>
                {axis.today}
              </span>
              <span style={{ opacity: 0.6 }}>{axis.future}</span>
            </>
          ) : (
            <span>{axis.today}</span>
          )}
        </div>
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

  // Junction between the days behind and the days ahead: they do not share the same days per pixel.
  if (s.projection.length > 1) {
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(s.todayX, 2);
    ctx.lineTo(s.todayX, height - 1);
    ctx.stroke();
    ctx.restore();
  }

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

  if (s.trend.length > 1) {
    const area = ctx.createLinearGradient(0, 0, 0, height);
    area.addColorStop(0, withAlpha(colors.coral, 0.22));
    area.addColorStop(1, withAlpha(colors.coral, 0));
    ctx.fillStyle = area;
    ctx.beginPath();
    trace(ctx, s.trend, 1);
    const last = s.trend[s.trend.length - 1] as { x: number; y: number };
    const first = s.trend[0] as { x: number; y: number };
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

  if (s.trend.length > 1) {
    ctx.strokeStyle = line;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    trace(ctx, s.trend, progress);
    ctx.stroke();
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
