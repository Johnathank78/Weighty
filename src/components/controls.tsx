import { useCallback, useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { CONFIDENCE_LABEL } from '@/app/copy';
import type { ConfidenceLevel } from '@/science/types';

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

export function Range({ value, min, max, step, onChange, onCommit, label, valueText, size = 'md', zone, blockedBelow, lowerLimit, upperLimit, disabled }: RangeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const span = max - min || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
  const clamp = useCallback(
    (v: number) => {
      const stepped = Math.round((v - min) / step) * step + min;
      return Math.max(lowerLimit ?? min, Math.min(upperLimit ?? max, stepped));
    },
    [lowerLimit, upperLimit, max, min, step],
  );

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return value;
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    return clamp(min + p * span);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture unsupported */
    }
    setDragging(true);
    onChange(fromPointer(e));
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging) onChange(fromPointer(e));
  };
  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    onCommit?.(fromPointer(e));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = step * 10;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - step;
    else if (e.key === 'PageUp') next = value + big;
    else if (e.key === 'PageDown') next = value - big;
    else if (e.key === 'Home') next = lowerLimit ?? min;
    else if (e.key === 'End') next = upperLimit ?? max;
    if (next !== null) {
      e.preventDefault();
      const c = clamp(next);
      onChange(c);
      onCommit?.(c);
    }
  };

  return (
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
