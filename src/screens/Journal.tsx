import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { BARCODE_TEXT, FOOD_SEARCH_TEXT, FOOD_SOURCE_LABEL, JOURNAL_GAUGE_TEXT, JOURNAL_MASK_TEXT, JOURNAL_TEXT, JOURNAL_TIME_TEXT, OFF_RESULT_TEXT, PORTION_TEXT, PRODUCT_SEARCH_TEXT } from '@/app/copy';
import { BottomSheet } from '@/components/BottomSheet';
import { NumberField, parseDecimal, Segmented } from '@/components/controls';
import { formatDayMonth, formatGrams, formatInteger, formatKcal, formatNumber } from '@/domain/format';
import { addFoodEntry, addPortion, consumptionDate, deleteFoodEntry, foodKey, hourGroups, intakeGauge, intakeTotals, journalDay, MACRO_KEYS, maskedGaugeParts, missingMacros, localTimeOf, nutrientsForGrams, portionsFor, restoreFoodEntry } from '@/domain/journal';
import type { ManualFood, NewEntryInput, RecentFood, ResolvedFood } from '@/domain/journal';
import { buildSearchIndex, loadCiqual, resolveCiqualFood, searchIndex } from '@/domain/foodSearch';
import { libraryFoodToManual, libraryFoodToResolved, previousFoods, productLibraryKey, rememberManualFood, rememberProduct, touchLibraryFood } from '@/domain/foodLibrary';
import type { CiqualFood, CiqualTable, SearchIndex } from '@/domain/foodSearch';
import type { FoodEntry, FoodNutrients, LibraryFood } from '@/domain/types';
import { offProductToFood } from '@/adapters/openFoodFacts';
import type { OffFailure, OffProduct } from '@/adapters/openFoodFacts';
import { isMasked, MASK_OFF, resetMask, toggleMasked, toggleMaskMode } from './journalMask';
import type { MaskState } from './journalMask';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useOpenFoodFacts } from '@/hooks/useOpenFoodFacts';
import { addDays } from '@/science/dates';

type DayChoice = 'today' | 'yesterday';

/** Same macro colours as the Macros detail screen. */
const MACRO_COLOR = { proteinG: 'var(--coral)', carbsG: 'var(--peach)', fatG: 'var(--sand)' } as const;

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
  const [mask, setMask] = useState<MaskState>(MASK_OFF);
  // Changing day leaves the masking mode: its ids belong to the day they were chosen on (A2).
  useEffect(() => setMask(resetMask()), [day, today]);
  const plan = store.plan;
  if (!plan) return null;
  const date = day === 'today' ? today : addDays(today, -1);
  const summary = journalDay(store, date);
  const log = store.dailyLogs.find((l) => l.date === date);
  // The plan target is only shown next to the journal, as it was for that day (never modified here).
  const targetKcal = log?.calorieTargetForDay ?? plan.calorieTarget;
  const targetMacros = log?.macrosForDay ?? plan.macrosDisplay ?? plan.macros;
  // Masking is a view of the screen only: nothing is written, and it resets when the journal is left (J-11).
  const visibleEntries = summary.entries.filter((e) => !isMasked(mask, e.id));
  const visible = intakeTotals(visibleEntries);
  // B3: the gauges sum the visible entries, so their completeness is read on that same set.
  const missing = missingMacros(visibleEntries);
  const incomplete = MACRO_KEYS.filter((k) => missing[k]);
  const maskedKcal = Math.max(0, summary.intakeLoggedKcal - visible.energyKcal);
  const kcal = intakeGauge(visible.energyKcal, targetKcal);
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <h1 className="h-page" style={{ marginBottom: 4 }}>
          {JOURNAL_TEXT.title}
        </h1>
        <button
          type="button"
          className="icon-button"
          aria-pressed={mask.active}
          data-active={mask.active}
          aria-label={mask.active ? JOURNAL_MASK_TEXT.done : JOURNAL_MASK_TEXT.start}
          onClick={() => setMask(toggleMaskMode)}
          disabled={summary.entries.length === 0 && !mask.active}
        >
          <EyeIcon off={mask.ids.size > 0} />
        </button>
      </div>
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
            {JOURNAL_GAUGE_TEXT.logged(formatInteger(Math.round(visible.energyKcal)))}
          </span>
          <span style={{ font: '500 12.5px var(--font)', color: 'var(--ink2)' }}>{JOURNAL_GAUGE_TEXT.target(formatKcal(targetKcal))}</span>
        </div>
        <JournalBar label="Calories saisies par rapport à la cible du plan" parts={maskedGaugeParts(visible.energyKcal, summary.intakeLoggedKcal, targetKcal)} />
        <p className="tabular" style={{ margin: '8px 0 0', font: '500 12.5px var(--font)', color: 'var(--ink2)' }} aria-live="polite">
          {kcal.beyond > 0 ? JOURNAL_GAUGE_TEXT.beyond(formatInteger(kcal.beyond)) : JOURNAL_GAUGE_TEXT.remaining(formatInteger(kcal.remaining))}
          {maskedKcal > 0 ? ` · ${JOURNAL_MASK_TEXT.maskedKcal(formatInteger(Math.round(maskedKcal)))}` : ''}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14, marginTop: 18 }}>
          {(
            [
              ['proteinG', visible.proteinG, summary.intakeLoggedProteinG, targetMacros.proteinG],
              ['carbsG', visible.carbsG, summary.intakeLoggedCarbsG, targetMacros.carbsG],
              ['fatG', visible.fatG, summary.intakeLoggedFatG, targetMacros.fatG],
            ] as const
          ).map(([key, logged, total, target]) => {
            return (
              <div key={key}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, font: '500 11.5px var(--font)', color: 'var(--ink2)', marginBottom: 3 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: MACRO_COLOR[key] }} aria-hidden="true" />
                  {JOURNAL_GAUGE_TEXT.macros[key]}
                </div>
                <div className="tabular" style={{ font: '600 14px var(--font)', marginBottom: 7 }}>
                  {/* B3: a macro that some foods leave out is a floor, never an exact total. */}
                  {missing[key] ? (
                    <>
                      <span aria-hidden="true">≥ </span>
                      <span className="sr-only">{JOURNAL_GAUGE_TEXT.atLeast} </span>
                    </>
                  ) : null}
                  {formatInteger(Math.round(logged))} <span style={{ font: '400 12px var(--font)', color: 'var(--ink2)' }}>/ {formatGrams(target)} g</span>
                </div>
                <JournalBar label={`${JOURNAL_GAUGE_TEXT.macros[key]} saisis par rapport à la cible`} parts={maskedGaugeParts(logged, total, target)} color={MACRO_COLOR[key]} />
              </div>
            );
          })}
        </div>
        {incomplete.length > 0 ? (
          <p className="small" style={{ margin: '14px 0 0' }}>
            {JOURNAL_TEXT.partialMacros(incomplete.map((k) => JOURNAL_GAUGE_TEXT.macrosLower[k]))}
          </p>
        ) : null}
      </section>

      {guidance ? (
        <div className="note" style={{ marginBottom: 18 }}>
          <span>{guidance}</span>
        </div>
      ) : null}

      <h2 className="section-label" style={{ marginTop: 0 }}>
        {JOURNAL_TEXT.meals}
      </h2>
      {summary.entries.length === 0 ? (
        <p className="small" style={{ margin: 0 }}>
          {JOURNAL_TEXT.empty}
        </p>
      ) : (
        <>
          {mask.active ? (
            <p className="small" style={{ margin: '0 0 10px' }}>
              {JOURNAL_MASK_TEXT.hint}
            </p>
          ) : null}
          <ol className="timeline" aria-label="Aliments du jour, par heure">
            {hourGroups(summary.entries).map((group) => (
              <li key={group.hour} className="timeline__item">
                <div className="timeline__head">
                  <span className="timeline__dot" aria-hidden="true" />
                  <time className="timeline__time tabular" dateTime={`${date}T${group.hour}:00`}>
                    {Number(group.hour)} h
                  </time>
                  <span className="timeline__rule" aria-hidden="true" />
                </div>
                <ul className="timeline__entries">
                  {group.entries.map((e) => {
                    const isHidden = isMasked(mask, e.id);
                    return (
                      <li key={e.id} className="timeline__content" data-hidden={isHidden}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                          <span style={{ flex: 1, minWidth: 0, font: '500 14px/1.35 var(--font)' }}>{e.name}</span>
                          <span className="tabular" style={{ font: '600 14px var(--font)', whiteSpace: 'nowrap' }}>
                            {kcalText(e.intake.energyKcal)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                          <span style={{ flex: 1, minWidth: 0, font: '400 12px var(--font)', color: 'var(--ink2)' }}>{[e.consumedTime, e.brand, entryQuantityText(e), FOOD_SOURCE_LABEL[e.source]].filter(Boolean).join(' · ')}</span>
                          {mask.active ? (
                            <button type="button" className="icon-button icon-button--small" aria-pressed={isHidden} aria-label={isHidden ? JOURNAL_MASK_TEXT.show(e.name) : JOURNAL_MASK_TEXT.hide(e.name)} onClick={() => setMask((m) => toggleMasked(m, e.id))}>
                              <EyeIcon off={isHidden} />
                            </button>
                          ) : (
                            <button type="button" className="link" style={{ fontSize: 12.5, minHeight: 32 }} onClick={() => remove(e)} aria-label={`Retirer ${e.name}`}>
                              Retirer
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </>
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

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.8 10s3-5.6 8.2-5.6S18.2 10 18.2 10s-3 5.6-8.2 5.6S1.8 10 1.8 10Z" />
      <circle cx="10" cy="10" r="2.6" />
      {off ? <path d="M3 17 17 3" /> : null}
    </svg>
  );
}

/**
 * The app's progress bar. With masked entries (J-11) the coloured part shows the visible entries and a grey
 * part striped in white shows the masked ones, after it.
 */
function JournalBar({ label, parts, color }: { label: string; parts: { visible: number; masked: number }; color?: string }) {
  return (
    <div className="progress progress--split" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(parts.visible * 100)}>
      <div className="progress__bar" style={{ width: `${parts.visible * 100}%`, ...(color ? { background: color } : {}) }} />
      {parts.masked > 0 ? <div className="progress__masked" style={{ left: `${parts.visible * 100}%`, width: `${parts.masked * 100}%` }} /> : null}
    </div>
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
    const now = nowIso();
    const r = addFoodEntry(store, input, now);
    if (!r.ok) return false;
    // "Mes aliments" (J-09): a named free entry is stored automatically; a stored product is marked as used.
    const next = input.kind === 'manual' ? rememberManualFood(r.store, input.food, now) : input.food.source === 'off' ? touchLibraryFood(r.store, productLibraryKey(input.food.sourceId), now) : r.store;
    commit(next);
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
              onPickManual={(food) => {
                setManualPrefill(food);
                setTab('manual');
              }}
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
function ProductsPanel({ onPick, onPickRecent, onPickManual, onManual }: { onPick: (f: ResolvedFood) => void; onPickRecent: (r: RecentFood) => void; onPickManual: (f: ManualFood) => void; onManual: (name: string) => void }) {
  const { go } = useNav();
  const { store, update, nowIso } = useWheighty();
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
  const previous = useMemo(() => previousFoods(store), [store]);
  const trimmed = query.trim();
  const local = useMemo(() => (data && trimmed ? searchIndex(data.index, trimmed, 30) : []), [data, trimmed]);
  const remoteForQuery = remote && remote.query === trimmed ? remote : null;
  const library = store.foodJournal.library;
  const libraryIndex = useMemo(() => buildSearchIndex(library, (f) => [f.name, f.brand].filter(Boolean).join(' ')), [library]);
  const mine = useMemo(() => (trimmed ? searchIndex(libraryIndex, trimmed, 10) : []), [libraryIndex, trimmed]);
  const mineBarcodes = new Set(mine.map((f) => f.sourceId));

  /** A product fetched for the user is stored in "Mes aliments" (J-09), then picked. */
  const choose = (p: OffProduct, fromLibrary = false) => {
    const now = nowIso();
    // Values reused from "Mes aliments" keep their original save date (freshness of the stored record).
    if (!fromLibrary) update((s) => rememberProduct(s, p, now));
    const food = offProductToFood(p, now);
    if (food) onPick(food);
  };
  const chooseStored = (f: LibraryFood) => {
    const manual = libraryFoodToManual(f);
    if (manual) return onPickManual(manual);
    const food = libraryFoodToResolved(f);
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
        style={{ order: 2 }}
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

      <div className="sheet__scroll" style={{ order: 4 }} aria-live="polite">
        {trimmed === '' ? (
          <>
            <p className="small search-hint">{online ? FOOD_SEARCH_TEXT.emptyQueryOnline : FOOD_SEARCH_TEXT.emptyQuery}</p>
            {/* B4: in scan mode only the camera and its fallback fields stay on screen. */}
            {!scanOpen && previous.length > 0 ? (
              <div className="food-list">
                <div className="eyebrow">{FOOD_SEARCH_TEXT.previous}</div>
                {previous.map((p) =>
                  p.kind === 'recent' ? (
                    <FoodRow
                      key={p.key}
                      name={p.food.food.name}
                      detail={p.food.kind === 'resolved' ? [FOOD_SOURCE_LABEL[p.food.food.source], p.food.food.brand].filter(Boolean).join(' · ') : FOOD_SOURCE_LABEL.manual}
                      kcal={p.food.kind === 'resolved' ? `${formatInteger(Math.round(p.food.food.per100g.energyKcal))} kcal / 100 g` : kcalText(p.food.food.intake.energyKcal)}
                      onClick={() => onPickRecent(p.food as RecentFood)}
                    />
                  ) : (
                    <FoodRow
                      key={p.key}
                      name={p.food.name}
                      detail={[p.food.source === 'off' ? FOOD_SOURCE_LABEL.off : FOOD_SOURCE_LABEL.manual, p.food.brand].filter(Boolean).join(' · ')}
                      kcal={p.food.per100g ? `${formatInteger(Math.round(p.food.per100g.energyKcal))} kcal / 100 g` : kcalText(p.food.manual?.intake.energyKcal ?? 0)}
                      onClick={() => chooseStored(p.food as LibraryFood)}
                    />
                  ),
                )}
              </div>
            ) : null}
          </>
        ) : (
          <div className="food-list">
            {online ? (
              busy ? (
                <p className="small search-hint">{FOOD_SEARCH_TEXT.searchingOnline}</p>
              ) : !remoteForQuery && trimmed.length >= 2 ? (
                <button type="button" className="btn btn--outline btn--small" style={{ alignSelf: 'flex-start' }} onClick={() => void searchOnline()}>
                  {FOOD_SEARCH_TEXT.searchOnline}
                </button>
              ) : null
            ) : null}
            {failed ? <p className="small search-hint">{FOOD_SEARCH_TEXT.tableFailed}</p> : !data ? <p className="small search-hint">{FOOD_SEARCH_TEXT.loadingTable}</p> : null}
            {mine.map((f) =>
              f.source === 'manual' || f.per100g ? (
                <FoodRow
                  key={`m${f.key}`}
                  name={f.name}
                  detail={[FOOD_SEARCH_TEXT.mine, f.brand].filter(Boolean).join(' · ')}
                  kcal={f.per100g ? `${formatInteger(Math.round(f.per100g.energyKcal))} kcal / 100 g` : kcalText(f.manual?.intake.energyKcal ?? 0)}
                  onClick={() => chooseStored(f)}
                />
              ) : null,
            )}
            {local.map((f) => (
              <FoodRow key={`c${f.code}`} name={f.name} detail={`${FOOD_SOURCE_LABEL.ciqual} · ${f.group}`} kcal={`${formatInteger(Math.round(f.kcal))} kcal / 100 g`} onClick={() => data && onPick(resolveCiqualFood(f, data.table, nowIso()))} />
            ))}
            {data && local.length === 0 && mine.length === 0 && !remoteForQuery?.products.length ? <p className="small search-hint">{FOOD_SEARCH_TEXT.noLocalResult}</p> : null}
            {remoteForQuery?.products.filter((p) => !mineBarcodes.has(p.barcode)).map((p) =>
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
            {online ? null : (
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
function BarcodePanel({ onClose, onFound, onManual }: { onClose: () => void; onFound: (p: OffProduct, fromLibrary: boolean) => void; onManual: (name: string) => void }) {
  const { go } = useNav();
  const { store, update, nowIso } = useWheighty();
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
      if (r.product.per100g) onFound(r.product, r.fromLibrary !== undefined);
      else {
        // Stored like any fetched product, even without calories: a later scan is answered offline.
        const product = r.product;
        const now = nowIso();
        if (r.fromLibrary === undefined) update((s) => rememberProduct(s, product, now));
        setIncomplete(product);
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
      <div className="barcode-panel barcode-panel--below">
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
  // Live camera: preview under the selector, above the search bar. Without a camera (unsupported, refused,
  // code already read), the code field sits under the search bar and the message under the code field.
  const showVideo = cameraOn && scanner.state !== 'unsupported' && scanner.state !== 'denied' && scanner.state !== 'error';
  const status = busy ? BARCODE_TEXT.looking : (message ?? cameraMessage);
  // D4: one line is always reserved, so the camera state messages do not move the code field.
  const statusLine = (
    <p className="small hint-slot" style={{ margin: showVideo ? '0 0 8px' : '8px 0 0' }} aria-live="polite">
      {status ?? ''}
    </p>
  );
  const incompleteLink = incomplete ? (
    <button type="button" className="link" style={{ margin: '8px 0 0', alignSelf: 'flex-start' }} onClick={() => onManual(incomplete.name)}>
      Saisir à la main ›
    </button>
  ) : null;
  return (
    <div className={showVideo ? 'barcode-panel' : 'barcode-panel barcode-panel--below'}>
      {showVideo ? (
        <>
          <div className="barcode-panel__camera">
            <video ref={scanner.videoRef} muted playsInline aria-label="Aperçu de la caméra" />
            <span className="barcode-panel__frame" aria-hidden="true" />
          </div>
          {statusLine}
        </>
      ) : (
        <video ref={scanner.videoRef} muted playsInline hidden />
      )}
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
      {showVideo ? null : statusLine}
      {incompleteLink}
    </div>
  );
}

/** "Je viens de le manger" checked by default on today's journal; unchecked, the time field is the value kept (J-06). */
function ConsumedTimeField({ selectedDate, today, timing, setTiming }: TimingProps) {
  const canBeNow = selectedDate === today;
  const showTime = !canBeNow || !timing.justAte;
  const field = showTime ? (
    <label className="time-field" style={{ width: '100%' }}>
      <span>{JOURNAL_TIME_TEXT.eatenAt}</span>
      <input type="time" required value={timing.time} onChange={(e) => e.target.value && setTiming({ ...timing, time: e.target.value })} />
    </label>
  ) : null;
  return (
    <div style={{ margin: '14px 0 4px' }}>
      {canBeNow ? (
        <>
          <button type="button" role="checkbox" aria-checked={timing.justAte} className="checkbox" style={{ paddingTop: 0 }} onClick={() => setTiming({ ...timing, justAte: !timing.justAte })}>
            <span className="checkbox__box" aria-hidden="true">
              {timing.justAte ? '✓' : ''}
            </span>
            <span>{JOURNAL_TIME_TEXT.justAte}</span>
          </button>
          {/* D4: the slot is always there, so unticking the box never pushes the rest of the panel down. */}
          <div className="time-slot">{field}</div>
        </>
      ) : (
        field
      )}
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
  // Portions announced by the product record (Open Food Facts) come first; Ciqual has none (J-12).
  const sourcePortions = [
    ...(food.servingGrams ? [{ id: 'source:serving', label: PORTION_TEXT.serving, grams: food.servingGrams }] : []),
    ...(food.packageGrams && food.packageGrams !== food.servingGrams ? [{ id: 'source:package', label: PORTION_TEXT.package, grams: food.packageGrams }] : []),
  ];
  const personal = portionsFor(store, key);
  const portions = [...sourcePortions, ...personal];
  // Without any weight for this food, the user is asked once for the weight of a unit, then it is remembered.
  const knowsUnit = sourcePortions.length > 0 || personal.some((p) => p.foodKey === key);
  const [gramsRaw, setGramsRaw] = useState('100');
  const [portionId, setPortionId] = useState<string | null>(null);
  const [countRaw, setCountRaw] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [newPortion, setNewPortion] = useState<{ label: string; grams: string; forAll: boolean } | null>(null);
  // Each message sits next to the field it is about, rather than all of them far below the form.
  const [portionError, setPortionError] = useState<string | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [unitRaw, setUnitRaw] = useState('');

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

  /**
   * The creation form is opened and closed by its own chip, next to the portions it adds to, and can be
   * left by the chip, by "Annuler" or by saving. Nothing traps the panel any more.
   */
  const togglePortionForm = () => {
    setPortionError(null);
    setNewPortion((open) => (open ? null : { label: '', grams: grams !== null && grams > 0 ? String(Math.round(grams)) : '', forAll: false }));
  };

  const createPortion = () => {
    if (!newPortion) return;
    const g = parseDecimal(newPortion.grams);
    if (!newPortion.label.trim() || g === null || g <= 0) {
      setPortionError('Donne un nom et un poids à la portion.');
      return;
    }
    const r = addPortion(store, { label: newPortion.label, grams: g, foodKey: newPortion.forAll ? null : key }, nowIso());
    if (!r.ok) {
      setPortionError('Cette portion n’a pas pu être enregistrée.');
      return;
    }
    commit(r.store);
    setNewPortion(null);
    setPortionError(null);
    setPortionId(r.id);
  };

  const rememberUnit = () => {
    const g = parseDecimal(unitRaw);
    if (g === null || g <= 0 || g > 5000) {
      setUnitError('Indique le poids d’une unité en grammes.');
      return;
    }
    const r = addPortion(store, { label: PORTION_TEXT.unit, grams: g, foodKey: key }, nowIso());
    if (!r.ok) {
      setUnitError('Ce poids n’a pas pu être enregistré.');
      return;
    }
    commit(r.store);
    setUnitRaw('');
    setUnitError(null);
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

      {/*
        J-12, rework: the portions and the button that adds one live on the same row. That button is a
        toggle (`aria-expanded`), so the form closes exactly where it opened.
      */}
      <div className="chips" style={{ marginBottom: 14 }}>
        {portions.length > 0 ? (
          <div role="radiogroup" aria-label="Portion" style={{ display: 'contents' }}>
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
        <button type="button" className="chip chip--add" aria-expanded={newPortion !== null} aria-controls="portion-form" onClick={togglePortionForm}>
          {newPortion ? PORTION_TEXT.createClose : PORTION_TEXT.createOpen}
        </button>
      </div>

      {newPortion ? (
        <div className="card portion-form" id="portion-form" style={{ padding: 16, margin: '0 0 14px' }}>
          <label className="label" htmlFor="portion-label">
            Nom de la portion
          </label>
          <div className="value-box value-box--text">
            <input id="portion-label" value={newPortion.label} maxLength={40} placeholder="Mon bol, une tranche..." onChange={(e) => setNewPortion({ ...newPortion, label: e.target.value })} />
          </div>
          <div style={{ height: 10 }} />
          <NumberField label="Poids d’une portion" value={newPortion.grams} onChange={(v) => setNewPortion({ ...newPortion, grams: v })} unit="g" placeholder="150" />
          <button type="button" role="checkbox" aria-checked={newPortion.forAll} className="checkbox" style={{ paddingTop: 12 }} onClick={() => setNewPortion({ ...newPortion, forAll: !newPortion.forAll })}>
            <span className="checkbox__box" aria-hidden="true">
              {newPortion.forAll ? '✓' : ''}
            </span>
            <span>Utilisable pour tous les aliments</span>
          </button>
          {/* D4: reserved slot, the message never moves the two actions under it. */}
          <p className="field-error field-error--slot" role="alert">
            {portionError ?? ''}
          </p>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn--outline" onClick={createPortion}>
              {PORTION_TEXT.createSave}
            </button>
            <button type="button" className="btn btn--ghost" onClick={togglePortionForm}>
              {PORTION_TEXT.createCancel}
            </button>
          </div>
        </div>
      ) : null}
      {sourcePortions.length > 0 ? (
        <p className="small" style={{ margin: '-6px 0 12px' }}>
          {PORTION_TEXT.sourceNote}
        </p>
      ) : null}

      {!knowsUnit ? (
        <form
          className="unit-prompt"
          onSubmit={(e) => {
            e.preventDefault();
            rememberUnit();
          }}
        >
          <label htmlFor="unit-weight">{PORTION_TEXT.unitQuestion}</label>
          <div className="unit-prompt__field">
            <input id="unit-weight" inputMode="decimal" autoComplete="off" placeholder="60" value={unitRaw} onChange={(e) => setUnitRaw(e.target.value)} />
            <span>g</span>
          </div>
          <button type="submit" className="btn btn--outline btn--small" disabled={unitRaw.trim() === ''}>
            {PORTION_TEXT.remember}
          </button>
        </form>
      ) : null}
      {!knowsUnit ? (
        <p className="field-error field-error--slot" role="alert" style={{ margin: '-8px 0 10px' }}>
          {unitError ?? ''}
        </p>
      ) : null}

      {portion ? <NumberField label={`Nombre de portions « ${portion.label} »`} value={countRaw} onChange={setCountRaw} unit="×" placeholder="1" /> : <NumberField label="Quantité" value={gramsRaw} onChange={setGramsRaw} unit="g" placeholder="100" />}

      <p className="tabular" style={{ margin: '12px 0 0', font: '600 15px var(--font)' }} aria-live="polite">
        {preview ? nutrientsLine(preview) : ' '}
      </p>
      <ConsumedTimeField {...timingProps} />
      {/* D4: reserved slot, so a validation message never moves the buttons under it. */}
      <p className="field-error field-error--slot" role="alert">
        {error ?? ''}
      </p>

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
    // The three macros are required here: a free entry is the one place where nothing can be looked up,
    // so leaving them out would silently turn the day's macro totals into floors (B3).
    const macros = { proteinG: optional(protein), carbsG: optional(carbs), fatG: optional(fat) };
    const g = optional(grams);
    if (energy === null || energy < 0 || energy > 20000) {
      setError('Indique les calories (kcal) de ce que tu as mangé.');
      return;
    }
    const missing = MACRO_KEYS.filter((k) => macros[k] === null);
    if (missing.length > 0) {
      setError(JOURNAL_TEXT.manualMacrosRequired(missing.map((k) => JOURNAL_GAUGE_TEXT.macrosLower[k])));
      return;
    }
    if (macros.proteinG === 'invalid' || macros.carbsG === 'invalid' || macros.fatG === 'invalid' || g === 'invalid' || g === 0) {
      setError('Une des valeurs n’est pas un nombre valide.');
      return;
    }
    if (!onSave({ name, intake: { energyKcal: energy, proteinG: macros.proteinG, carbsG: macros.carbsG, fatG: macros.fatG }, grams: g })) setError('Cette saisie n’a pas pu être ajoutée.');
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
      <NumberField label="Calories" value={kcal} onChange={setKcal} unit="kcal" inputMode="decimal" placeholder="450" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
        <NumberField label="Protéines" value={protein} onChange={setProtein} unit="g" placeholder="20" />
        <NumberField label="Glucides" value={carbs} onChange={setCarbs} unit="g" placeholder="50" />
        <NumberField label="Lipides" value={fat} onChange={setFat} unit="g" placeholder="15" />
      </div>
      <p className="small" style={{ margin: '6px 0 0' }}>
        {JOURNAL_TEXT.manualMacrosNote}
      </p>
      <div style={{ height: 12 }} />
      <NumberField label="Poids (facultatif)" value={grams} onChange={setGrams} unit="g" placeholder="250" />
      <ConsumedTimeField {...timingProps} />
      {/* D4: reserved slot, so a validation message never moves the button under it. */}
      <p className="field-error field-error--slot" role="alert">
        {error ?? ''}
      </p>
      <button type="button" className="btn btn--primary" style={{ marginTop: 18 }} onClick={submit}>
        Ajouter au journal
      </button>
    </>
  );
}
