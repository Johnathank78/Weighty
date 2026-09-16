import { useEffect, useMemo, useState } from 'react';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { FOOD_SOURCE_LABEL, JOURNAL_TEXT, OFF_RESULT_TEXT, PRODUCT_SEARCH_TEXT } from '@/app/copy';
import { BottomSheet } from '@/components/BottomSheet';
import { NumberField, parseDecimal, Segmented } from '@/components/controls';
import { formatDayMonth, formatGrams, formatInteger, formatKcal, formatNumber } from '@/domain/format';
import { addFoodEntry, addPortion, deleteFoodEntry, foodKey, restoreFoodEntry, journalDay, localTimeOf, nutrientsForGrams, portionsFor, recentFoods } from '@/domain/journal';
import type { ManualFood, RecentFood, ResolvedFood } from '@/domain/journal';
import { loadCiqual, resolveCiqualFood, searchIndex } from '@/domain/foodSearch';
import type { CiqualFood, CiqualTable, SearchIndex } from '@/domain/foodSearch';
import type { FoodEntry, FoodNutrients, WheightyStore } from '@/domain/types';
import { offProductToFood } from '@/adapters/openFoodFacts';
import type { OffFailure, OffProduct } from '@/adapters/openFoodFacts';
import { useOpenFoodFacts } from '@/hooks/useOpenFoodFacts';
import { addDays } from '@/science/dates';

type DayChoice = 'today' | 'yesterday';

const kcalText = (kcal: number) => `${formatInteger(Math.round(kcal))} kcal`;
const gramsText = (g: number | null) => (g === null ? 'n.d.' : `${formatNumber(g, g >= 10 ? 0 : 1)} g`);

export function JournalScreen() {
  const { back, openSheet, sheet, showToast } = useNav();
  const { store, today, update } = useWheighty();
  const [day, setDay] = useState<DayChoice>('today');
  const plan = store.plan;
  if (!plan) return null;
  const date = day === 'today' ? today : addDays(today, -1);
  const summary = journalDay(store, date);
  const log = store.dailyLogs.find((l) => l.date === date);
  // The plan target is only shown next to the journal, as it was for that day (never modified here).
  const targetKcal = log?.calorieTargetForDay ?? plan.calorieTarget;
  const targetMacros = log?.macrosForDay ?? plan.macrosDisplay ?? plan.macros;
  const guidance = JOURNAL_TEXT.completenessGuidance;

  const remove = (entry: FoodEntry) => {
    update((s) => deleteFoodEntry(s, entry.id));
    showToast(JOURNAL_TEXT.removed, { label: JOURNAL_TEXT.undo, run: () => update((s) => restoreFoodEntry(s, entry)) });
  };

  return (
    <main className="screen">
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

      <section className="card" aria-label="Saisi et cible du plan" style={{ padding: 20, margin: '20px 0 18px' }}>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ font: '500 11.5px var(--font)', color: 'var(--ink2)', marginBottom: 4 }}>{JOURNAL_TEXT.logged}</div>
            <div className="tabular" style={{ font: '600 26px var(--font)' }}>
              {formatInteger(Math.round(summary.intakeLoggedKcal))} <span className="unit">kcal</span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ font: '500 11.5px var(--font)', color: 'var(--ink2)', marginBottom: 4 }}>{JOURNAL_TEXT.planTarget}</div>
            <div className="tabular" style={{ font: '600 26px var(--font)' }}>
              {formatKcal(targetKcal)} <span className="unit">kcal</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 16 }}>
          {(
            [
              ['Prot.', summary.intakeLoggedProteinG, targetMacros.proteinG],
              ['Gluc.', summary.intakeLoggedCarbsG, targetMacros.carbsG],
              ['Lip.', summary.intakeLoggedFatG, targetMacros.fatG],
            ] as const
          ).map(([label, logged, target]) => (
            <div key={label}>
              <div style={{ font: '500 11.5px var(--font)', color: 'var(--ink2)' }}>{label}</div>
              <div className="tabular" style={{ font: '600 15px var(--font)' }}>
                {formatInteger(Math.round(logged))} <span style={{ font: '400 12px var(--font)', color: 'var(--ink2)' }}>/ {formatGrams(target)} g</span>
              </div>
            </div>
          ))}
        </div>
        {!summary.macrosComplete ? (
          <p className="small" style={{ margin: '12px 0 0' }}>
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
        <p className="small" style={{ margin: '0 0 22px' }}>
          {JOURNAL_TEXT.empty}
        </p>
      ) : (
        <div className="rows" style={{ marginBottom: 22 }}>
          {summary.entries.map((e) => (
            <div key={e.id} className="row" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', font: '500 14px/1.35 var(--font)' }}>{e.name}</span>
                <span style={{ display: 'block', font: '400 12px var(--font)', color: 'var(--ink2)', marginTop: 2 }}>
                  {[e.localTime, e.brand, entryQuantityText(e), FOOD_SOURCE_LABEL[e.source]].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="tabular" style={{ font: '600 14px var(--font)', whiteSpace: 'nowrap' }}>
                {kcalText(e.intake.energyKcal)}
              </span>
              <button type="button" className="link" style={{ fontSize: 12.5 }} onClick={() => remove(e)} aria-label={`Retirer ${e.name}`}>
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn btn--primary" onClick={() => openSheet('food')}>
        {JOURNAL_TEXT.add}
      </button>
      {sheet === 'food' ? <FoodSheet date={date} /> : null}
    </main>
  );
}

function entryQuantityText(e: FoodEntry): string | null {
  if (!e.quantity) return null;
  const p = e.quantity.portion;
  return p ? `${formatNumber(p.count, p.count % 1 === 0 ? 0 : 1)} × ${p.label} (${gramsText(e.quantity.grams)})` : gramsText(e.quantity.grams);
}

type Tab = 'foods' | 'products' | 'manual';

function FoodSheet({ date }: { date: string }) {
  const { closeSheet, showToast } = useNav();
  const { store, commit, nowIso } = useWheighty();
  const [tab, setTab] = useState<Tab>('foods');
  const [picked, setPicked] = useState<ResolvedFood | null>(null);
  const [manualPrefill, setManualPrefill] = useState<ManualFood | null>(null);

  const done = () => {
    closeSheet();
    showToast(JOURNAL_TEXT.added);
  };
  const saveManual = (food: ManualFood): boolean => {
    const r = addFoodEntry(store, { kind: 'manual', date, localTime: localTimeOf(new Date()), food }, nowIso());
    if (r.ok) commit(r.store);
    return r.ok;
  };
  const pickRecent = (r: RecentFood) => {
    if (r.kind === 'resolved') setPicked(r.food);
    else {
      setManualPrefill(r.food);
      setTab('manual');
    }
  };

  const title = picked ? picked.name : 'Ajouter un aliment';
  return (
    <BottomSheet open onClose={closeSheet} title={title}>
      {picked ? (
        <QuantityStep food={picked} date={date} onBack={() => setPicked(null)} onSaved={done} />
      ) : (
        <>
          <Segmented
            label="Source"
            options={[
              { value: 'foods', label: 'Aliments' },
              { value: 'products', label: 'Produits' },
              { value: 'manual', label: 'Libre' },
            ]}
            value={tab}
            onChange={setTab}
          />
          <div style={{ marginTop: 18 }}>
            {tab === 'foods' ? <CiqualTab store={store} onPick={setPicked} onPickRecent={pickRecent} /> : null}
            {tab === 'products' ? (
              <ProductsTab
                onPick={setPicked}
                onManual={(name) => {
                  setManualPrefill({ name, intake: { energyKcal: 0, proteinG: null, carbsG: null, fatG: null }, grams: null });
                  setTab('manual');
                }}
              />
            ) : null}
            {tab === 'manual' ? <ManualTab key={manualPrefill?.name ?? ''} prefill={manualPrefill} onSave={(f) => saveManual(f) && done()} /> : null}
          </div>
        </>
      )}
    </BottomSheet>
  );
}

function SearchBox({ label, value, onChange, onSubmit, placeholder, inputMode = 'search', action }: { label: string; value: string; onChange: (v: string) => void; onSubmit?: () => void; placeholder: string; inputMode?: 'search' | 'numeric'; action?: string }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
      style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}
    >
      <label className="value-box value-box--text" style={{ flex: 1 }}>
        <span className="sr-only">{label}</span>
        <input type="search" inputMode={inputMode} autoComplete="off" enterKeyHint="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </label>
      {action ? (
        <button type="submit" className="btn btn--outline btn--small">
          {action}
        </button>
      ) : null}
    </form>
  );
}

function FoodRow({ name, detail, kcal, onClick, disabled }: { name: string; detail?: string; kcal: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="opt-row" onClick={onClick} disabled={disabled} style={{ alignItems: 'center', opacity: disabled ? 0.7 : 1 }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block' }}>{name}</span>
        {detail ? <span style={{ display: 'block', font: '400 12px var(--font)', color: 'var(--ink2)', marginTop: 2 }}>{detail}</span> : null}
      </span>
      <span className="opt-row__hint">{kcal}</span>
    </button>
  );
}

function CiqualTab({ store, onPick, onPickRecent }: { store: WheightyStore; onPick: (f: ResolvedFood) => void; onPickRecent: (r: RecentFood) => void }) {
  const { nowIso } = useWheighty();
  const [query, setQuery] = useState('');
  const [data, setData] = useState<{ table: CiqualTable; index: SearchIndex<CiqualFood> } | null>(null);
  const [failed, setFailed] = useState(false);
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
  const results = useMemo(() => (data && query.trim() ? searchIndex(data.index, query, 30) : []), [data, query]);

  return (
    <>
      <SearchBox label="Rechercher un aliment" value={query} onChange={setQuery} placeholder="Pomme, riz cuit, yaourt..." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {query.trim() === '' ? (
          recents.length > 0 ? (
            <>
              <div className="eyebrow">Récents</div>
              {recents.map((r) => (
                <FoodRow key={r.key} name={r.food.name} detail={r.kind === 'resolved' ? `${FOOD_SOURCE_LABEL[r.food.source]}${r.food.brand ? ` · ${r.food.brand}` : ''}` : FOOD_SOURCE_LABEL.manual} kcal={r.kind === 'resolved' ? `${formatInteger(Math.round(r.food.per100g.energyKcal))} kcal / 100 g` : kcalText(r.food.intake.energyKcal)} onClick={() => onPickRecent(r)} />
              ))}
            </>
          ) : (
            <p className="small" style={{ margin: 0 }}>
              Cherche parmi les aliments de la table Ciqual, disponible hors connexion.
            </p>
          )
        ) : failed ? (
          <p className="small">La table des aliments n’a pas pu être chargée. La saisie libre reste disponible.</p>
        ) : !data ? (
          <p className="small">Chargement de la table...</p>
        ) : results.length === 0 ? (
          <p className="small">Aucun aliment trouvé. Essaie un autre mot, ou la saisie libre.</p>
        ) : (
          results.map((f) => <FoodRow key={f.code} name={f.name} detail={f.group} kcal={`${formatInteger(Math.round(f.kcal))} kcal / 100 g`} onClick={() => onPick(resolveCiqualFood(f, data.table, nowIso()))} />)
        )}
      </div>
    </>
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

function ProductsTab({ onPick, onManual }: { onPick: (f: ResolvedFood) => void; onManual: (name: string) => void }) {
  const { go } = useNav();
  const { store, nowIso } = useWheighty();
  const off = useOpenFoodFacts();
  const [barcode, setBarcode] = useState('');
  const [terms, setTerms] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [products, setProducts] = useState<OffProduct[]>([]);

  if (!store.preferences.productSearchEnabled) {
    return (
      <div className="note" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
        <span>{PRODUCT_SEARCH_TEXT.disabledNote}</span>
        <button type="button" className="link" onClick={() => go('params')}>
          {PRODUCT_SEARCH_TEXT.openSettings} ›
        </button>
      </div>
    );
  }

  const choose = (p: OffProduct) => {
    const food = offProductToFood(p, nowIso());
    if (food) onPick(food);
  };
  const runLookup = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setProducts([]);
    const r = await off.lookup(barcode);
    setBusy(false);
    if (r.kind === 'found') {
      if (r.product.per100g) choose(r.product);
      else {
        setProducts([r.product]);
        setMessage(OFF_RESULT_TEXT.incomplete);
      }
    } else if (r.kind === 'not_found') setMessage(OFF_RESULT_TEXT.notFound);
    else setMessage(r.kind === 'invalid_input' ? OFF_RESULT_TEXT.invalidBarcode : failureText(r));
  };
  const runSearch = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setProducts([]);
    const r = await off.search(terms);
    setBusy(false);
    if (r.kind === 'results') {
      setProducts(r.products);
      if (r.products.length === 0) setMessage(OFF_RESULT_TEXT.noResults);
    } else setMessage(r.kind === 'invalid_input' ? OFF_RESULT_TEXT.invalidTerms : failureText(r));
  };

  return (
    <>
      <SearchBox label="Code-barres" value={barcode} onChange={(v) => setBarcode(v.replace(/[^\d\s-]/g, '').slice(0, 20))} onSubmit={() => void runLookup()} placeholder="Code-barres (chiffres)" inputMode="numeric" action="Chercher" />
      <div style={{ height: 10 }} />
      <SearchBox label="Rechercher un produit" value={terms} onChange={setTerms} onSubmit={() => void runSearch()} placeholder="Marque, nom du produit" action="Rechercher" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }} aria-live="polite">
        {busy ? <p className="small">Recherche sur Open Food Facts...</p> : null}
        {message ? (
          <p className="small" style={{ margin: 0 }}>
            {message}
          </p>
        ) : null}
        {products.map((p) =>
          p.per100g ? (
            <FoodRow key={p.barcode} name={p.name} detail={[p.brand, p.barcode].filter(Boolean).join(' · ')} kcal={`${formatInteger(Math.round(p.per100g.energyKcal))} kcal / 100 g`} onClick={() => choose(p)} />
          ) : (
            <div key={p.barcode} className="opt-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <span>{p.name}</span>
              <span style={{ font: '400 12px var(--font)', color: 'var(--ink2)' }}>Calories non renseignées</span>
              <button type="button" className="link" onClick={() => onManual(p.name)}>
                Saisir à la main ›
              </button>
            </div>
          ),
        )}
        <p className="small" style={{ margin: '6px 0 0' }}>
          Données Open Food Facts, base collaborative sous licence ODbL.
        </p>
      </div>
    </>
  );
}

/** Date of the Open Food Facts record (last_modified_t), or of the lookup when unknown. */
function offRecordDate(food: ResolvedFood): string {
  const seconds = Number(food.sourceVersion);
  return (Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : food.resolvedAt).slice(0, 10);
}

const nutrientsLine = (n: FoodNutrients) => `${kcalText(n.energyKcal)} · P ${gramsText(n.proteinG)} · G ${gramsText(n.carbsG)} · L ${gramsText(n.fatG)}`;

function QuantityStep({ food, date, onBack, onSaved }: { food: ResolvedFood; date: string; onBack: () => void; onSaved: () => void }) {
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
    const r = addFoodEntry(
      store,
      { kind: 'resolved', date, localTime: localTimeOf(new Date()), food, grams, ...(portion && count !== null ? { portion: { id: portion.id, label: portion.label, count, gramsEach: portion.grams } } : {}) },
      nowIso(),
    );
    if (!r.ok) {
      setError('Cet aliment n’a pas pu être ajouté.');
      return;
    }
    commit(r.store);
    onSaved();
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
      <p className="sheet__lead" style={{ marginTop: -6 }}>
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

      {portion ? (
        <NumberField label={`Nombre de portions « ${portion.label} »`} value={countRaw} onChange={setCountRaw} unit="×" />
      ) : (
        <NumberField label="Quantité" value={gramsRaw} onChange={setGramsRaw} unit="g" />
      )}

      <p className="tabular" style={{ margin: '14px 0 4px', font: '600 15px var(--font)' }} aria-live="polite">
        {preview ? nutrientsLine(preview) : ' '}
      </p>
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

function ManualTab({ prefill, onSave }: { prefill: ManualFood | null; onSave: (food: ManualFood) => void }) {
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
    onSave({ name, intake: { energyKcal: energy, proteinG: p, carbsG: c, fatG: f }, grams: g });
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
        <NumberField label="Prot. (facult.)" value={protein} onChange={setProtein} unit="g" />
        <NumberField label="Gluc. (facult.)" value={carbs} onChange={setCarbs} unit="g" />
        <NumberField label="Lip. (facult.)" value={fat} onChange={setFat} unit="g" />
      </div>
      <div style={{ height: 12 }} />
      <NumberField label="Poids (facultatif)" value={grams} onChange={setGrams} unit="g" />
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
