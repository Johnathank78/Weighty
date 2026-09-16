import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { BARCODE_TEXT, FOOD_SEARCH_TEXT, FOOD_SOURCE_LABEL, JOURNAL_GAUGE_TEXT, JOURNAL_TEXT, JOURNAL_TIME_TEXT, OFF_RESULT_TEXT, PRODUCT_SEARCH_TEXT } from '@/app/copy';
import { BottomSheet } from '@/components/BottomSheet';
import { NumberField, parseDecimal, Segmented } from '@/components/controls';
import { formatDayMonth, formatGrams, formatInteger, formatKcal, formatNumber } from '@/domain/format';
import { addFoodEntry, addPortion, consumptionDate, deleteFoodEntry, foodKey, intakeGauge, journalDay, localTimeOf, nutrientsForGrams, portionsFor, recentFoods, restoreFoodEntry } from '@/domain/journal';
import type { ManualFood, NewEntryInput, RecentFood, ResolvedFood } from '@/domain/journal';
import { loadCiqual, resolveCiqualFood, searchIndex } from '@/domain/foodSearch';
import type { CiqualFood, CiqualTable, SearchIndex } from '@/domain/foodSearch';
import type { FoodEntry, FoodNutrients } from '@/domain/types';
import { offProductToFood } from '@/adapters/openFoodFacts';
import type { OffFailure, OffProduct } from '@/adapters/openFoodFacts';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useOpenFoodFacts } from '@/hooks/useOpenFoodFacts';
import { addDays } from '@/science/dates';

type DayChoice = 'today' | 'yesterday';

const kcalText = (kcal: number) => `${formatInteger(Math.round(kcal))} kcal`;
const gramsText = (g: number | null) => (g === null ? 'n.d.' : `${formatNumber(g, g >= 10 ? 0 : 1)} g`);

/**
 * Time of consumption chosen in the add sheet (J-06). Kept for the journal screen visit only: leaving the
 * journal, or a new day, brings "Je viens de le manger" back to checked. Never persisted.
 */
type TimingSession = { justAte: boolean; time: string };

export function JournalScreen() {
  const { back, openSheet, sheet, showToast } = useNav();
  const { store, today, update } = useWheighty();
  const [day, setDay] = useState<DayChoice>('today');
  const [timing, setTiming] = useState<TimingSession>(() => ({ justAte: true, time: localTimeOf(new Date()) }));
  useEffect(() => setTiming({ justAte: true, time: localTimeOf(new Date()) }), [today]);
  const plan = store.plan;
  if (!plan) return null;
  const date = day === 'today' ? today : addDays(today, -1);
  const summary = journalDay(store, date);
  const log = store.dailyLogs.find((l) => l.date === date);
  // The plan target is only shown next to the journal, as it was for that day (never modified here).
  const targetKcal = log?.calorieTargetForDay ?? plan.calorieTarget;
  const targetMacros = log?.macrosForDay ?? plan.macrosDisplay ?? plan.macros;
  const kcal = intakeGauge(summary.intakeLoggedKcal, targetKcal);
  const guidance = JOURNAL_TEXT.completenessGuidance;

  const remove = (entry: FoodEntry) => {
    update((s) => deleteFoodEntry(s, entry.id));
    showToast(JOURNAL_TEXT.removed, { label: JOURNAL_TEXT.undo, run: () => update((s) => restoreFoodEntry(s, entry)) });
  };

  return (
    <main className="screen screen--journal">
      <button type="button" className="back" onClick={back}>
        ‹ Aujourd’hui
      </button>
      <h1 className="h-page" style={{ marginBottom: 4 }}>
        {JOURNAL_TEXT.title}
      </h1>
      <p className="eyebrow" style={{ margin: '0 0 20px' }}>
        {JOURNAL_TEXT.eyebrow}
      </p>
      <Segmented
        label="Jour"
        options={[
          { value: 'today', label: 'Aujourd’hui' },
          { value: 'yesterday', label: 'Hier' },
        ]}
        value={day}
        onChange={setDay}
        className="day-picker"
      />

      <section className="card" aria-label="Saisi et cible du plan" style={{ padding: 20, margin: '20px 0 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
          <span className="tabular" style={{ font: '600 20px var(--font)' }}>
            {JOURNAL_GAUGE_TEXT.logged(formatInteger(Math.round(summary.intakeLoggedKcal)))}
          </span>
          <span style={{ font: '500 12.5px var(--font)', color: 'var(--ink2)' }}>{JOURNAL_GAUGE_TEXT.target(formatKcal(targetKcal))}</span>
        </div>
        <div className="progress" role="progressbar" aria-label="Calories saisies par rapport à la cible du plan" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(kcal.fraction * 100)}>
          <div className="progress__bar" style={{ width: `${kcal.fraction * 100}%` }} />
        </div>
        <p className="tabular" style={{ margin: '8px 0 0', font: '500 12.5px var(--font)', color: 'var(--ink2)' }} aria-live="polite">
          {kcal.beyond > 0 ? JOURNAL_GAUGE_TEXT.beyond(formatInteger(kcal.beyond)) : JOURNAL_GAUGE_TEXT.remaining(formatInteger(kcal.remaining))}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginTop: 18 }}>
          {(
            [
              ['proteinG', summary.intakeLoggedProteinG, targetMacros.proteinG],
              ['carbsG', summary.intakeLoggedCarbsG, targetMacros.carbsG],
              ['fatG', summary.intakeLoggedFatG, targetMacros.fatG],
            ] as const
          ).map(([key, logged, target]) => {
            const g = intakeGauge(logged, target);
            return (
              <div key={key}>
                <div style={{ font: '500 11.5px var(--font)', color: 'var(--ink2)', marginBottom: 3 }}>{JOURNAL_GAUGE_TEXT.macros[key]}</div>
                <div className="tabular" style={{ font: '600 14px var(--font)', marginBottom: 7 }}>
                  {formatInteger(Math.round(logged))} <span style={{ font: '400 12px var(--font)', color: 'var(--ink2)' }}>/ {formatGrams(target)} g</span>
                </div>
                <div className="progress" role="progressbar" aria-label={`${JOURNAL_GAUGE_TEXT.macros[key]} saisis par rapport à la cible`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.fraction * 100)}>
                  <div className="progress__bar" style={{ width: `${g.fraction * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        {!summary.macrosComplete ? (
          <p className="small" style={{ margin: '14px 0 0' }}>
            {JOURNAL_TEXT.partialMacros}
          </p>
        ) : null}
      </section>

      {guidance ? (
        <div className="note" style={{ marginBottom: 18 }}>
          <span>{guidance}</span>
        </div>
      ) : null}

      {summary.entries.length === 0 ? (
        <p className="small" style={{ margin: 0 }}>
          {JOURNAL_TEXT.empty}
        </p>
      ) : (
        <ol className="timeline" aria-label="Aliments du jour, par heure">
          {summary.entries.map((e) => (
            <li key={e.id} className="timeline__item">
              <time className="timeline__time tabular" dateTime={`${e.date}T${e.consumedTime}`}>
                {e.consumedTime}
              </time>
              <span className="timeline__dot" aria-hidden="true" />
              <div className="timeline__content">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0, font: '500 14px/1.35 var(--font)' }}>{e.name}</span>
                  <span className="tabular" style={{ font: '600 14px var(--font)', whiteSpace: 'nowrap' }}>
                    {kcalText(e.intake.energyKcal)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                  <span style={{ flex: 1, minWidth: 0, font: '400 12px var(--font)', color: 'var(--ink2)' }}>{[e.brand, entryQuantityText(e), FOOD_SOURCE_LABEL[e.source]].filter(Boolean).join(' · ')}</span>
                  <button type="button" className="link" style={{ fontSize: 12.5, minHeight: 32 }} onClick={() => remove(e)} aria-label={`Retirer ${e.name}`}>
                    Retirer
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Portal: the animated screen container would otherwise anchor this fixed footer to the page end. */}
      {createPortal(
        <div className="journal-footer">
          <button type="button" className="btn btn--primary" onClick={() => openSheet('food')}>
            {JOURNAL_TEXT.add}
          </button>
        </div>,
        document.body,
      )}
      {sheet === 'food' ? <FoodSheet selectedDate={date} today={today} timing={timing} setTiming={setTiming} /> : null}
    </main>
  );
}

function entryQuantityText(e: FoodEntry): string | null {
  if (!e.quantity) return null;
  const p = e.quantity.portion;
  return p ? `${formatNumber(p.count, p.count % 1 === 0 ? 0 : 1)} × ${p.label} (${gramsText(e.quantity.grams)})` : gramsText(e.quantity.grams);
}

type Tab = 'products' | 'manual';
type TimingProps = { selectedDate: string; today: string; timing: TimingSession; setTiming: (t: TimingSession) => void };

/** Day and times of a new entry from the sheet's time control (J-06). */
function entryTiming({ selectedDate, today, timing }: Omit<TimingProps, 'setTiming'>): Pick<NewEntryInput, 'date' | 'localTime' | 'consumedTime'> {
  const now = localTimeOf(new Date());
  // "Je viens de le manger" only exists on today's journal; yesterday always takes an explicit time.
  if (selectedDate === today && timing.justAte) return { date: today, localTime: now, consumedTime: now };
  return { date: consumptionDate(selectedDate, today, timing.time, now), localTime: now, consumedTime: timing.time };
}

function FoodSheet(props: TimingProps) {
  const { closeSheet, showToast } = useNav();
  const { store, commit, nowIso } = useWheighty();
  const [tab, setTab] = useState<Tab>('products');
  const [picked, setPicked] = useState<ResolvedFood | null>(null);
  const [manualPrefill, setManualPrefill] = useState<ManualFood | null>(null);

  const save = (build: (timing: Pick<NewEntryInput, 'date' | 'localTime' | 'consumedTime'>) => NewEntryInput): boolean => {
    const input = build(entryTiming(props));
    const r = addFoodEntry(store, input, nowIso());
    if (!r.ok) return false;
    commit(r.store);
    closeSheet();
    showToast(input.date < props.selectedDate ? JOURNAL_TIME_TEXT.savedYesterday : JOURNAL_TEXT.added);
    return true;
  };
  const pickRecent = (r: RecentFood) => {
    if (r.kind === 'resolved') setPicked(r.food);
    else {
      setManualPrefill(r.food);
      setTab('manual');
    }
  };

  return (
    <BottomSheet open onClose={closeSheet} title={picked ? picked.name : JOURNAL_TEXT.add} size="fixed">
      {picked ? (
        <div className="sheet__scroll">
          <QuantityStep food={picked} onBack={() => setPicked(null)} onSave={save} timingProps={props} />
        </div>
      ) : (
        <>
          <Segmented
            label="Type d’ajout"
            options={[
              { value: 'products', label: FOOD_SEARCH_TEXT.tabs.products },
              { value: 'manual', label: FOOD_SEARCH_TEXT.tabs.manual },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'products' ? (
            <ProductsPanel
              onPick={setPicked}
              onPickRecent={pickRecent}
              onManual={(name) => {
                setManualPrefill({ name, intake: { energyKcal: 0, proteinG: null, carbsG: null, fatG: null }, grams: null });
                setTab('manual');
              }}
            />
          ) : (
            <div className="sheet__scroll">
              <ManualTab key={manualPrefill?.name ?? ''} prefill={manualPrefill} onSave={(food) => save((t) => ({ kind: 'manual', ...t, food }))} timingProps={props} />
            </div>
          )}
        </>
      )}
    </BottomSheet>
  );
}

function BarcodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M2.5 6V3.5a1 1 0 0 1 1-1H6M16 2.5h2.5a1 1 0 0 1 1 1V6M19.5 16v2.5a1 1 0 0 1-1 1H16M6 19.5H3.5a1 1 0 0 1-1-1V16" />
      <path d="M6.5 7v8M9 7v8M11.5 7v8M14.5 7v8M16 7v8" />
    </svg>
  );
}

function FoodRow({ name, detail, kcal, onClick }: { name: string; detail?: string; kcal: string; onClick: () => void }) {
  return (
    <button type="button" className="opt-row" onClick={onClick} style={{ alignItems: 'center' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block' }}>{name}</span>
        {detail ? <span style={{ display: 'block', font: '400 12px var(--font)', color: 'var(--ink2)', marginTop: 2 }}>{detail}</span> : null}
      </span>
      <span className="opt-row__hint">{kcal}</span>
    </button>
  );
}

function failureText(r: OffFailure): string {
  switch (r.kind) {
    case 'offline':
      return OFF_RESULT_TEXT.offline;
    case 'timeout':
      return OFF_RESULT_TEXT.timeout;
    case 'rate_limited':
      return OFF_RESULT_TEXT.rateLimited(r.retryAfterSec);
    case 'unavailable':
      return OFF_RESULT_TEXT.unavailable;
    case 'disabled':
      return OFF_RESULT_TEXT.disabled;
    case 'invalid_input':
      return '';
  }
}

/** One search for generic foods (Ciqual, local, as you type) and packaged products (Open Food Facts, on submit). */
function ProductsPanel({ onPick, onPickRecent, onManual }: { onPick: (f: ResolvedFood) => void; onPickRecent: (r: RecentFood) => void; onManual: (name: string) => void }) {
  const { go } = useNav();
  const { store, nowIso } = useWheighty();
  const online = store.preferences.productSearchEnabled;
  const off = useOpenFoodFacts();
  const [query, setQuery] = useState('');
  const [data, setData] = useState<{ table: CiqualTable; index: SearchIndex<CiqualFood> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [remote, setRemote] = useState<{ query: string; products: OffProduct[]; message: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    loadCiqual().then(
      (d) => alive && setData(d),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, []);
  const recents = useMemo(() => recentFoods(store), [store]);
  const trimmed = query.trim();
  const local = useMemo(() => (data && trimmed ? searchIndex(data.index, trimmed, 30) : []), [data, trimmed]);
  const remoteForQuery = remote && remote.query === trimmed ? remote : null;

  const choose = (p: OffProduct) => {
    const food = offProductToFood(p, nowIso());
    if (food) onPick(food);
  };
  const searchOnline = async () => {
    if (!online || busy || trimmed.length < 2) return;
    setBusy(true);
    const r = await off.search(trimmed);
    setBusy(false);
    if (r.kind === 'results') setRemote({ query: trimmed, products: r.products, message: r.products.length === 0 ? OFF_RESULT_TEXT.noResults : null });
    else setRemote({ query: trimmed, products: [], message: r.kind === 'invalid_input' ? OFF_RESULT_TEXT.invalidTerms : failureText(r) });
  };

  return (
    <>
      {scanOpen ? <BarcodePanel onClose={() => setScanOpen(false)} onFound={choose} onManual={onManual} /> : null}
      <form
        className="search-box"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void searchOnline();
        }}
      >
        <label className="sr-only" htmlFor="food-search">
          Rechercher un aliment ou un produit
        </label>
        <input id="food-search" type="search" autoComplete="off" enterKeyHint="search" value={query} placeholder={FOOD_SEARCH_TEXT.placeholder} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="search-box__icon" aria-label={scanOpen ? BARCODE_TEXT.close : BARCODE_TEXT.open} aria-pressed={scanOpen} onClick={() => setScanOpen(!scanOpen)}>
          <BarcodeIcon />
        </button>
      </form>

      <div className="sheet__scroll" aria-live="polite">
        {trimmed === '' ? (
          <>
            <p className="small search-hint">{online ? FOOD_SEARCH_TEXT.emptyQueryOnline : FOOD_SEARCH_TEXT.emptyQuery}</p>
            {recents.length > 0 ? (
              <div className="food-list">
                <div className="eyebrow">{FOOD_SEARCH_TEXT.recents}</div>
                {recents.map((r) => (
                  <FoodRow
                    key={r.key}
                    name={r.food.name}
                    detail={r.kind === 'resolved' ? [FOOD_SOURCE_LABEL[r.food.source], r.food.brand].filter(Boolean).join(' · ') : FOOD_SOURCE_LABEL.manual}
                    kcal={r.kind === 'resolved' ? `${formatInteger(Math.round(r.food.per100g.energyKcal))} kcal / 100 g` : kcalText(r.food.intake.energyKcal)}
                    onClick={() => onPickRecent(r)}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="food-list">
            {failed ? <p className="small search-hint">{FOOD_SEARCH_TEXT.tableFailed}</p> : !data ? <p className="small search-hint">{FOOD_SEARCH_TEXT.loadingTable}</p> : null}
            {local.map((f) => (
              <FoodRow key={`c${f.code}`} name={f.name} detail={`${FOOD_SOURCE_LABEL.ciqual} · ${f.group}`} kcal={`${formatInteger(Math.round(f.kcal))} kcal / 100 g`} onClick={() => data && onPick(resolveCiqualFood(f, data.table, nowIso()))} />
            ))}
            {data && local.length === 0 && !remoteForQuery?.products.length ? <p className="small search-hint">{FOOD_SEARCH_TEXT.noLocalResult}</p> : null}
            {remoteForQuery?.products.map((p) =>
              p.per100g ? (
                <FoodRow key={`o${p.barcode}`} name={p.name} detail={[FOOD_SOURCE_LABEL.off, p.brand].filter(Boolean).join(' · ')} kcal={`${formatInteger(Math.round(p.per100g.energyKcal))} kcal / 100 g`} onClick={() => choose(p)} />
              ) : (
                <div key={`o${p.barcode}`} className="opt-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                  <span>{p.name}</span>
                  <span style={{ font: '400 12px var(--font)', color: 'var(--ink2)' }}>{OFF_RESULT_TEXT.incomplete}</span>
                  <button type="button" className="link" onClick={() => onManual(p.name)}>
                    Saisir à la main ›
                  </button>
                </div>
              ),
            )}
            {remoteForQuery?.message ? <p className="small search-hint">{remoteForQuery.message}</p> : null}
            {online ? (
              busy ? (
                <p className="small search-hint">{FOOD_SEARCH_TEXT.searchingOnline}</p>
              ) : !remoteForQuery && trimmed.length >= 2 ? (
                <button type="button" className="btn btn--outline btn--small" style={{ alignSelf: 'flex-start' }} onClick={() => void searchOnline()}>
                  {FOOD_SEARCH_TEXT.searchOnline}
                </button>
              ) : null
            ) : (
              <button type="button" className="link small" style={{ textAlign: 'left' }} onClick={() => go('params')}>
                {FOOD_SEARCH_TEXT.onlineOff} ›
              </button>
            )}
            {remoteForQuery?.products.length ? <p className="small search-hint">{FOOD_SEARCH_TEXT.offAttribution}</p> : null}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Barcode resolution chain (J-05): 1. native detection, 3. automatic Open Food Facts match, 4. keyboard
 * entry, always visible. Step 2 (text extraction from the image) is not bundled.
 */
function BarcodePanel({ onClose, onFound, onManual }: { onClose: () => void; onFound: (p: OffProduct) => void; onManual: (name: string) => void }) {
  const { go } = useNav();
  const { store } = useWheighty();
  const online = store.preferences.productSearchEnabled;
  const off = useOpenFoodFacts();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [incomplete, setIncomplete] = useState<OffProduct | null>(null);
  const [cameraOn, setCameraOn] = useState(online);

  const lookup = async (raw: string) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setIncomplete(null);
    const r = await off.lookup(raw);
    setBusy(false);
    if (r.kind === 'found') {
      if (r.product.per100g) onFound(r.product);
      else {
        setIncomplete(r.product);
        setMessage(OFF_RESULT_TEXT.incomplete);
      }
    } else if (r.kind === 'not_found') setMessage(OFF_RESULT_TEXT.notFound);
    else setMessage(r.kind === 'invalid_input' ? OFF_RESULT_TEXT.invalidBarcode : failureText(r));
  };
  const scanner = useBarcodeScanner(cameraOn, (detected) => {
    setCameraOn(false);
    setCode(detected);
    void lookup(detected);
  });

  if (!online) {
    return (
      <div className="barcode-panel">
        <p className="small" style={{ margin: 0 }}>
          {PRODUCT_SEARCH_TEXT.disabledNote}
        </p>
        <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
          <button type="button" className="link" onClick={() => go('params')}>
            {PRODUCT_SEARCH_TEXT.openSettings} ›
          </button>
          <button type="button" className="link" style={{ color: 'var(--ink2)' }} onClick={onClose}>
            {BARCODE_TEXT.close}
          </button>
        </div>
      </div>
    );
  }

  const cameraMessage = { idle: null, starting: BARCODE_TEXT.starting, scanning: BARCODE_TEXT.scanning, unsupported: BARCODE_TEXT.unsupported, denied: BARCODE_TEXT.denied, error: BARCODE_TEXT.error }[scanner.state];
  const showVideo = cameraOn && (scanner.state === 'starting' || scanner.state === 'scanning');
  return (
    <div className="barcode-panel">
      {showVideo ? (
        <div className="barcode-panel__camera">
          <video ref={scanner.videoRef} muted playsInline aria-label="Aperçu de la caméra" />
          <span className="barcode-panel__frame" aria-hidden="true" />
        </div>
      ) : (
        <video ref={scanner.videoRef} muted playsInline hidden />
      )}
      <p className="small" style={{ margin: '0 0 8px' }} aria-live="polite">
        {busy ? BARCODE_TEXT.looking : (message ?? cameraMessage ?? '')}
      </p>
      {incomplete ? (
        <button type="button" className="link" style={{ marginBottom: 8 }} onClick={() => onManual(incomplete.name)}>
          Saisir à la main ›
        </button>
      ) : null}
      <form
        style={{ display: 'flex', gap: 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          setCameraOn(false);
          void lookup(code);
        }}
      >
        <label className="sr-only" htmlFor="barcode-input">
          {BARCODE_TEXT.manualLabel}
        </label>
        <input id="barcode-input" className="barcode-panel__input" inputMode="numeric" autoComplete="off" enterKeyHint="search" value={code} placeholder={BARCODE_TEXT.manualPlaceholder} onChange={(e) => setCode(e.target.value.replace(/[^\d\s-]/g, '').slice(0, 20))} />
        <button type="submit" className="btn btn--outline btn--small" disabled={busy}>
          {BARCODE_TEXT.lookup}
        </button>
      </form>
    </div>
  );
}

/** "Je viens de le manger" checked by default on today's journal; unchecked, the time field is the value kept (J-06). */
function ConsumedTimeField({ selectedDate, today, timing, setTiming }: TimingProps) {
  const canBeNow = selectedDate === today;
  const showTime = !canBeNow || !timing.justAte;
  return (
    <div style={{ margin: '14px 0 4px' }}>
      {canBeNow ? (
        <button type="button" role="checkbox" aria-checked={timing.justAte} className="checkbox" style={{ paddingTop: 0 }} onClick={() => setTiming({ ...timing, justAte: !timing.justAte })}>
          <span className="checkbox__box" aria-hidden="true">
            {timing.justAte ? '✓' : ''}
          </span>
          <span>{JOURNAL_TIME_TEXT.justAte}</span>
        </button>
      ) : null}
      {showTime ? (
        <label className="time-field" style={{ marginTop: canBeNow ? 10 : 0 }}>
          <span>{JOURNAL_TIME_TEXT.eatenAt}</span>
          <input type="time" required value={timing.time} onChange={(e) => e.target.value && setTiming({ ...timing, time: e.target.value })} />
        </label>
      ) : null}
    </div>
  );
}

/** Date of the Open Food Facts record (last_modified_t), or of the lookup when unknown. */
function offRecordDate(food: ResolvedFood): string {
  const seconds = Number(food.sourceVersion);
  return (Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : food.resolvedAt).slice(0, 10);
}

const nutrientsLine = (n: FoodNutrients) => `${kcalText(n.energyKcal)} · P ${gramsText(n.proteinG)} · G ${gramsText(n.carbsG)} · L ${gramsText(n.fatG)}`;

type SaveEntry = (build: (timing: Pick<NewEntryInput, 'date' | 'localTime' | 'consumedTime'>) => NewEntryInput) => boolean;

function QuantityStep({ food, onBack, onSave, timingProps }: { food: ResolvedFood; onBack: () => void; onSave: SaveEntry; timingProps: TimingProps }) {
  const { store, commit, nowIso } = useWheighty();
  const key = foodKey(food.source, food.sourceId);
  const portions = portionsFor(store, key);
  const [gramsRaw, setGramsRaw] = useState('100');
  const [portionId, setPortionId] = useState<string | null>(null);
  const [countRaw, setCountRaw] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [newPortion, setNewPortion] = useState<{ label: string; grams: string; forAll: boolean } | null>(null);

  const portion = portions.find((p) => p.id === portionId) ?? null;
  const count = parseDecimal(countRaw);
  const grams = portion ? (count !== null && count > 0 ? count * portion.grams : null) : parseDecimal(gramsRaw);
  const valid = grams !== null && grams > 0 && grams <= 5000;
  const preview = valid ? nutrientsForGrams(food.per100g, grams) : null;
  const sourceLine = food.source === 'ciqual' ? `Table ${food.sourceVersion}` : `Open Food Facts${food.brand ? `, ${food.brand}` : ''}, fiche du ${formatDayMonth(offRecordDate(food))}`;

  const save = () => {
    if (!valid || grams === null) {
      setError('Indique une quantité entre 1 et 5 000 g.');
      return;
    }
    const ok = onSave((t) => ({ kind: 'resolved', ...t, food, grams, ...(portion && count !== null ? { portion: { id: portion.id, label: portion.label, count, gramsEach: portion.grams } } : {}) }));
    if (!ok) setError('Cet aliment n’a pas pu être ajouté.');
  };

  const createPortion = () => {
    if (!newPortion) return;
    const g = parseDecimal(newPortion.grams);
    if (!newPortion.label.trim() || g === null || g <= 0) {
      setError('Donne un nom et un poids à la portion.');
      return;
    }
    const r = addPortion(store, { label: newPortion.label, grams: g, foodKey: newPortion.forAll ? null : key }, nowIso());
    if (!r.ok) {
      setError('Cette portion n’a pas pu être enregistrée.');
      return;
    }
    commit(r.store);
    setNewPortion(null);
    setError(null);
    setPortionId(r.id);
  };

  return (
    <>
      <p className="sheet__lead" style={{ margin: '0 0 4px' }}>
        {sourceLine}
      </p>
      <p className="small" style={{ margin: '0 0 16px' }}>
        Pour 100 g : {nutrientsLine(food.per100g)}
      </p>

      {portions.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }} role="radiogroup" aria-label="Portion">
          <button type="button" role="radio" aria-checked={portion === null} className="chip" onClick={() => setPortionId(null)}>
            En grammes
          </button>
          {portions.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={portionId === p.id} className="chip" onClick={() => setPortionId(p.id)}>
              {p.label} ({formatInteger(Math.round(p.grams))} g)
            </button>
          ))}
        </div>
      ) : null}

      {portion ? <NumberField label={`Nombre de portions « ${portion.label} »`} value={countRaw} onChange={setCountRaw} unit="×" /> : <NumberField label="Quantité" value={gramsRaw} onChange={setGramsRaw} unit="g" />}

      <p className="tabular" style={{ margin: '12px 0 0', font: '600 15px var(--font)' }} aria-live="polite">
        {preview ? nutrientsLine(preview) : ' '}
      </p>
      <ConsumedTimeField {...timingProps} />
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}

      {newPortion ? (
        <div className="card" style={{ padding: 16, margin: '12px 0' }}>
          <label className="label" htmlFor="portion-label">
            Nom de la portion
          </label>
          <div className="value-box value-box--text">
            <input id="portion-label" value={newPortion.label} maxLength={40} placeholder="Mon bol, une tranche..." onChange={(e) => setNewPortion({ ...newPortion, label: e.target.value })} />
          </div>
          <div style={{ height: 10 }} />
          <NumberField label="Poids d’une portion" value={newPortion.grams} onChange={(v) => setNewPortion({ ...newPortion, grams: v })} unit="g" />
          <button type="button" role="checkbox" aria-checked={newPortion.forAll} className="checkbox" style={{ paddingTop: 12 }} onClick={() => setNewPortion({ ...newPortion, forAll: !newPortion.forAll })}>
            <span className="checkbox__box" aria-hidden="true">
              {newPortion.forAll ? '✓' : ''}
            </span>
            <span>Utilisable pour tous les aliments</span>
          </button>
          <button type="button" className="btn btn--outline" style={{ marginTop: 12 }} onClick={createPortion}>
            Enregistrer la portion
          </button>
        </div>
      ) : (
        <button type="button" className="link" style={{ margin: '8px 0 4px' }} onClick={() => setNewPortion({ label: '', grams: grams !== null && grams > 0 ? String(Math.round(grams)) : '', forAll: false })}>
          Créer une portion ›
        </button>
      )}

      <button type="button" className="btn btn--primary" style={{ marginTop: 14 }} onClick={save} disabled={!valid}>
        Ajouter au journal
      </button>
      <button type="button" className="btn btn--ghost" onClick={onBack}>
        Choisir un autre aliment
      </button>
    </>
  );
}

function ManualTab({ prefill, onSave, timingProps }: { prefill: ManualFood | null; onSave: (food: ManualFood) => boolean; timingProps: TimingProps }) {
  const [name, setName] = useState(prefill?.name ?? '');
  const [kcal, setKcal] = useState(prefill && prefill.intake.energyKcal > 0 ? String(prefill.intake.energyKcal) : '');
  const [protein, setProtein] = useState(prefill?.intake.proteinG != null ? String(prefill.intake.proteinG) : '');
  const [carbs, setCarbs] = useState(prefill?.intake.carbsG != null ? String(prefill.intake.carbsG) : '');
  const [fat, setFat] = useState(prefill?.intake.fatG != null ? String(prefill.intake.fatG) : '');
  const [grams, setGrams] = useState(prefill?.grams != null ? String(prefill.grams) : '');
  const [error, setError] = useState<string | null>(null);

  const optional = (raw: string): number | null | 'invalid' => {
    if (raw.trim() === '') return null;
    const n = parseDecimal(raw);
    return n === null || n < 0 ? 'invalid' : n;
  };
  const submit = () => {
    const energy = parseDecimal(kcal);
    const p = optional(protein);
    const c = optional(carbs);
    const f = optional(fat);
    const g = optional(grams);
    if (energy === null || energy < 0 || energy > 20000) {
      setError('Indique les calories (kcal) de ce que tu as mangé.');
      return;
    }
    if (p === 'invalid' || c === 'invalid' || f === 'invalid' || g === 'invalid' || g === 0) {
      setError('Une des valeurs n’est pas un nombre valide.');
      return;
    }
    if (!onSave({ name, intake: { energyKcal: energy, proteinG: p, carbsG: c, fatG: f }, grams: g })) setError('Cette saisie n’a pas pu être ajoutée.');
  };

  return (
    <>
      <label className="label" htmlFor="manual-name">
        Nom (facultatif)
      </label>
      <div className="value-box value-box--text">
        <input id="manual-name" value={name} maxLength={200} placeholder="Repas du midi" onChange={(e) => setName(e.target.value)} />
      </div>
      <div style={{ height: 12 }} />
      <NumberField label="Calories" value={kcal} onChange={setKcal} unit="kcal" inputMode="decimal" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
        <NumberField label="Prot. (facult.)" value={protein} onChange={setProtein} unit="g" />
        <NumberField label="Gluc. (facult.)" value={carbs} onChange={setCarbs} unit="g" />
        <NumberField label="Lip. (facult.)" value={fat} onChange={setFat} unit="g" />
      </div>
      <div style={{ height: 12 }} />
      <NumberField label="Poids (facultatif)" value={grams} onChange={setGrams} unit="g" />
      <ConsumedTimeField {...timingProps} />
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn btn--primary" style={{ marginTop: 18 }} onClick={submit}>
        Ajouter au journal
      </button>
    </>
  );
}
