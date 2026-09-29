import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { CONFIDENCE_LABEL } from '@/app/copy';
import type { ConfidenceLevel } from '@/science/types';
import { canStep, snapToGrid, stepValue, valueAtPosition } from './rangeMath';
import type { RangeGrid } from './rangeMath';

export type Option<T extends string> = { value: T; label: string; hint?: string };

export function Segmented<T extends string>({ label, options, value, onChange, className }: { label: string; options: readonly Option<T>[]; value: T | null; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`seg ${className ?? ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className="seg__opt" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function OptionRows<T extends string>({ label, options, value, onChange }: { label: string; options: readonly Option<T>[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="stack-10" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} aria-label={o.hint ? `${o.label}, ${o.hint}` : o.label} className="opt-row" onClick={() => onChange(o.value)}>
          <span>{o.label}</span>
          {o.hint ? <span className="opt-row__hint">{o.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle" onClick={() => onChange(!checked)}>
      <span className="toggle__knob" />
    </button>
  );
}

export function ConfidenceBar({ level }: { level: 'low' | 'medium' | 'good' | 'high' }) {
  const on = { low: 1, medium: 2, good: 3, high: 4 }[level];
  return (
    <div className="conf" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="conf__seg" data-on={i < on} style={{ animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  );
}

const GAUGE_STEPS = ['low', 'medium', 'good'] as const;

/** Three-step confidence gauge (faible, moyenne, bonne); "élevée" fills all three. */
export function ConfidenceGauge({ level, label = 'Confiance du modèle' }: { level: ConfidenceLevel; label?: string }) {
  const on = { low: 1, medium: 2, good: 3, high: 3 }[level];
  return (
    <div className="gauge">
      <div className="gauge__head">
        <span className="gauge__label">{label}</span>
        <span className="gauge__value">{CONFIDENCE_LABEL[level]}</span>
      </div>
      <div className="gauge__track" aria-hidden="true">
        {GAUGE_STEPS.map((s, i) => (
          <div key={s} className="gauge__step" data-on={i < on} data-current={i === on - 1}>
            <span className="gauge__bar" style={{ animationDelay: `${i * 110}ms` }} />
            <span className="gauge__step-label">{CONFIDENCE_LABEL[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type RangeProps = {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  label: string;
  valueText: string;
  size?: 'md' | 'lg';
  /** Highlighted recommended zone, in value units. */
  zone?: readonly [number, number];
  /** Values below this are blocked (hatched). */
  blockedBelow?: number;
  /** Minimum value the thumb may reach. */
  lowerLimit?: number;
  /** Maximum value the thumb may reach; the track above it is shown as unavailable (hatched). */
  upperLimit?: number;
  disabled?: boolean;
};

/** Hold on − or +: first repeat after this delay, then one step every REPEAT_EVERY_MS. */
const REPEAT_DELAY_MS = 420;
const REPEAT_EVERY_MS = 70;
/** A press this close to the thumb centre grabs it where it is, without a jump (relative drag). */
const THUMB_GRAB_PX = 22;

export function Range({ value, min, max, step, onChange, onCommit, label, valueText, size = 'md', zone, blockedBelow, lowerLimit, upperLimit, disabled }: RangeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  /** Offset between the finger and the thumb centre when the thumb was grabbed (0 for a tap on the track). */
  const grabOffset = useRef(0);
  const span = max - min || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
  const grid: RangeGrid = { min, max, step, ...(lowerLimit !== undefined ? { lowerLimit } : {}), ...(upperLimit !== undefined ? { upperLimit } : {}) };
  // The repeat of a held button reads the latest value, not the one of the render that started it.
  const latest = useRef({ value, grid, onChange, onCommit });
  useEffect(() => {
    latest.current = { value, grid, onChange, onCommit };
  });
  const repeat = useRef<{ timer: number | null; moved: boolean }>({ timer: null, moved: false });
  useEffect(() => {
    const r = repeat.current;
    return () => {
      if (r.timer !== null) window.clearTimeout(r.timer);
    };
  }, []);

  const positionOf = (clientX: number) => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return (clientX - r.left) / r.width;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported */
    }
    setDragging(true);
    const r = ref.current?.getBoundingClientRect();
    const thumbX = r ? r.left + (pct(value) / 100) * r.width : e.clientX;
    // Grabbing the thumb keeps it under the finger; a tap elsewhere on the track moves it there (UX pass 1, D).
    grabOffset.current = Math.abs(e.clientX - thumbX) <= THUMB_GRAB_PX ? e.clientX - thumbX : 0;
    if (grabOffset.current === 0) {
      const p = positionOf(e.clientX);
      if (p !== null) onChange(valueAtPosition(p, grid));
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const p = positionOf(e.clientX - grabOffset.current);
    if (p !== null) onChange(valueAtPosition(p, grid));
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    const p = positionOf(e.clientX - grabOffset.current);
    onCommit?.(p === null ? value : valueAtPosition(p, grid));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = step * 10;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = stepValue(value, 1, grid);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = stepValue(value, -1, grid);
    else if (e.key === 'PageUp') next = value + big;
    else if (e.key === 'PageDown') next = value - big;
    else if (e.key === 'Home') next = lowerLimit ?? min;
    else if (e.key === 'End') next = upperLimit ?? max;
    if (next !== null) {
      e.preventDefault();
      const c = snapToGrid(next, grid);
      onChange(c);
      onCommit?.(c);
    }
  };

  /** − and + (UX pass 1, D): exactly one step, through the same grid and handler as the drag; held, they repeat. */
  const stepOnce = (direction: -1 | 1) => {
    const { value: v, grid: g, onChange: change } = latest.current;
    if (!canStep(v, direction, g)) return false;
    const next = stepValue(v, direction, g);
    // The next repeat must not wait for the re-render to see the new value.
    latest.current = { ...latest.current, value: next };
    change(next);
    return true;
  };
  const stopRepeat = () => {
    if (repeat.current.timer !== null) window.clearTimeout(repeat.current.timer);
    repeat.current.timer = null;
  };
  const startRepeat = (direction: -1 | 1) => (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled || e.button !== 0) return;
    stopRepeat();
    repeat.current.moved = stepOnce(direction);
    const again = (delay: number) => {
      repeat.current.timer = window.setTimeout(() => {
        if (stepOnce(direction)) again(REPEAT_EVERY_MS);
        else repeat.current.timer = null;
      }, delay);
    };
    again(REPEAT_DELAY_MS);
  };
  const release = () => {
    if (repeat.current.timer === null && !repeat.current.moved) return;
    stopRepeat();
    repeat.current.moved = false;
    latest.current.onCommit?.(latest.current.value);
  };
  const stepButton = (direction: -1 | 1) => (
    <button
      type="button"
      className="range-step"
      aria-label={`${direction < 0 ? 'Diminuer' : 'Augmenter'} : ${label}`}
      disabled={disabled || !canStep(value, direction, grid)}
      onPointerDown={startRepeat(direction)}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
      // Keyboard activation (Enter, Space) arrives as a click without a pointer press.
      onClick={(e) => {
        if (e.detail === 0 && stepOnce(direction)) latest.current.onCommit?.(latest.current.value);
      }}
    >
      <span aria-hidden="true">{direction < 0 ? '−' : '+'}</span>
    </button>
  );

  return (
    <div className={size === 'lg' ? 'range-row range-row--lg' : 'range-row'}>
      {stepButton(-1)}
      <div
        ref={ref}
        className={`range ${size === 'lg' ? 'range--lg' : ''}`}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={lowerLimit ?? min}
        aria-valuemax={upperLimit ?? max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        data-dragging={dragging}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKeyDown}
      >
        <div className="range__track">
          {zone ? <div className="range__zone" style={{ left: `${pct(zone[0])}%`, right: `${100 - pct(zone[1])}%` }} /> : null}
          {blockedBelow !== undefined && blockedBelow > min ? <div className="range__blocked" style={{ width: `${pct(blockedBelow)}%` }} /> : null}
          {upperLimit !== undefined && upperLimit < max ? <div className="range__blocked range__blocked--above" style={{ left: `${pct(upperLimit)}%` }} /> : null}
          <div className="range__fill" style={{ width: `${pct(value)}%` }} />
        </div>
        <div className="range__thumb" style={{ left: `${pct(value)}%` }} />
      </div>
      {stepButton(1)}
    </div>
  );
}

type NumberFieldProps = {
  label: string;
  value: string;
  onChange: (raw: string) => void;
  unit: string;
  error?: string | null;
  inputMode?: 'numeric' | 'decimal';
  hideLabel?: boolean;
  onBlur?: () => void;
  /** Grey example shown while the field is empty; never a stored value. */
  placeholder?: string;
};

export function NumberField({ label, value, onChange, unit, error, inputMode = 'decimal', hideLabel, onBlur, placeholder }: NumberFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'label'} style={{ marginBottom: 8 }}>
        {label}
      </label>
      <div className="value-box" data-invalid={Boolean(error)}>
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          enterKeyHint="done"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <span className="unit">{unit}</span>
      </div>
      {error ? (
        <p className="field-error" id={`${id}-err`} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Row({ label, value, valueClassName }: { label: ReactNode; value: ReactNode; valueClassName?: string }) {
  return (
    <div className="row">
      <span className="row__label">{label}</span>
      <span className={`row__value ${valueClassName ?? ''}`}>{value}</span>
    </div>
  );
}

export function NavRow({ label, onClick, detail }: { label: string; onClick: () => void; detail?: string }) {
  return (
    <button type="button" className="nav-row" onClick={onClick}>
      <span>{label}</span>
      <span className="flex gap-8" style={{ alignItems: 'center' }}>
        {detail ? <span className="small">{detail}</span> : null}
        <span className="chevron" aria-hidden="true">
          ›
        </span>
      </span>
    </button>
  );
}

/** Parses a French or English decimal string. Returns null when not a finite number. */
export function parseDecimal(raw: string): number | null {
  const cleaned = raw.replace(/[\s\u202F]/g, '').replace(',', '.');
  if (cleaned === '' || !/^-?\d*\.?\d*$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
