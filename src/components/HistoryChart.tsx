import { useEffect, useRef, useState } from 'react';
import { historyBarsScale, historyWeightScale } from '@/domain/historyChart';
import type { HistoryBarsScale, HistoryWeightScale } from '@/domain/historyChart';

type Props = {
  height: number;
  /** Read out in place of the drawing. */
  label: string;
} & (
  | {
      kind: 'bars';
      values: ReadonlyArray<number | null>;
      faded?: ReadonlyArray<boolean>;
      target: number | null;
      /** CSS colour token of the bars, e.g. '--coral'. */
      color: string;
    }
  | { kind: 'weight'; days: ReadonlyArray<{ weighIns: readonly number[]; trendKg: number | null }> }
);

/**
 * Canvas chart of "Historique" (UX pass 1, phase 2), like the Suivi chart: the geometry comes from `historyChart`, this
 * only paints it. Bars per day with the target of the plan in force as a dashed line, or weigh-ins and trend.
 */
export function HistoryChart(props: Props) {
  const { height, label } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [theme, setTheme] = useState<string>(() => (typeof document === 'undefined' ? 'light' : (document.documentElement.dataset.theme ?? 'light')));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => setWidth(canvas.clientWidth);
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(canvas);
    return () => ro?.disconnect();
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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const css = getComputedStyle(canvas);
    const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
    const base = { ink2: token('--ink2', '#736d67'), line: token('--line-strong', 'rgba(32,32,30,.14)'), coral: token('--coral', '#ff8162'), peach: token('--peach', '#ffb28f') };
    if (props.kind === 'bars') {
      paintBars(ctx, historyBarsScale({ width, height, values: props.values, ...(props.faded ? { faded: props.faded } : {}), target: props.target }), token(props.color, base.coral), base);
    } else {
      paintWeight(ctx, historyWeightScale({ width, height, days: props.days }), base);
    }
  }, [width, height, theme, props]);

  return (
    <canvas ref={canvasRef} className="chart" style={{ height }} role="img" aria-label={label}>
      {label}
    </canvas>
  );
}

type Base = { ink2: string; line: string; coral: string; peach: string };

function baseline(ctx: CanvasRenderingContext2D, width: number, height: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - 0.5);
  ctx.lineTo(width, height - 0.5);
  ctx.stroke();
}

function paintBars(ctx: CanvasRenderingContext2D, s: HistoryBarsScale, color: string, base: Base): void {
  baseline(ctx, s.width, s.height, base.line);
  ctx.fillStyle = color;
  for (const b of s.bars) {
    // A faded bar is a floor (some entries of the day give no macro), never a failure colour.
    ctx.globalAlpha = b.faded ? 0.35 : 0.85;
    const r = Math.min(1.5, b.width / 2);
    ctx.beginPath();
    ctx.moveTo(b.x, s.height);
    ctx.lineTo(b.x, b.y + r);
    ctx.quadraticCurveTo(b.x, b.y, b.x + r, b.y);
    ctx.lineTo(b.x + b.width - r, b.y);
    ctx.quadraticCurveTo(b.x + b.width, b.y, b.x + b.width, b.y + r);
    ctx.lineTo(b.x + b.width, s.height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (s.targetY !== null) {
    ctx.save();
    ctx.strokeStyle = base.ink2;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, Math.round(s.targetY) + 0.5);
    ctx.lineTo(s.width, Math.round(s.targetY) + 0.5);
    ctx.stroke();
    ctx.restore();
  }
}

function paintWeight(ctx: CanvasRenderingContext2D, s: HistoryWeightScale, base: Base): void {
  baseline(ctx, s.width, s.height, base.line);
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = base.ink2;
  for (const p of s.raw) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  if (s.trend.length > 1) {
    const line = ctx.createLinearGradient(0, 0, s.width, 0);
    line.addColorStop(0, base.peach);
    line.addColorStop(1, base.coral);
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    s.trend.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  }
}
