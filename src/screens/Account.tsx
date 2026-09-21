import { useEffect, useMemo, useRef, useState } from 'react';
import { useNav } from '@/app/navigation';
import { useWheighty } from '@/store/StoreProvider';
import { ACTIVITY_LABEL, BODY_FAT_METHOD_LABEL, DATA_SOURCES_TEXT, GOAL_LABEL, GOAL_SHORT, occupationLabel, PACE_LABEL, PLAN_ERROR_TEXT, PRODUCT_SEARCH_TEXT } from '@/app/copy';
import { clearLibrary } from '@/domain/foodLibrary';
import { BottomSheet } from '@/components/BottomSheet';
import { Mascot } from '@/components/Mascot';
import { NavRow, Range, Row, Segmented, Toggle } from '@/components/controls';
import { SpeedSlider } from '@/components/SpeedSlider';
import { changeGoal, currentWeightKg, storeSpeedSliderModel } from '@/domain/engine';
import { exportFileName, exportStore, parseImport } from '@/persistence/exportImport';
import type { ImportResult } from '@/persistence/exportImport';
import { formatFullDate, formatHeight, formatInteger, formatKcal, formatNumber, formatSignedWeight, formatWeight, KG_PER_LB, weightUnitLabel } from '@/domain/format';
import { defaultWeeklyRate, draftFromProfile, profileInitials } from '@/domain/onboarding';
import { appliedWeightCalibrations, goalGuardrails, weeksOfTracking } from '@/domain/views';
import { usePwa } from '@/hooks/usePwa';
import type { WheightyStore } from '@/domain/types';
import { SCIENTIFIC_MODEL_VERSION } from '@/science/constants';
import type { Goal } from '@/science/types';

export function ProfilScreen() {
  const { go, openSheet, setDraft } = useNav();
  const { store, today } = useWheighty();
  const profile = store.profile;
  const plan = store.plan;
  if (!profile || !plan) return null;
  const units = store.preferences.units;
  const weeks = weeksOfTracking(store, today);
  const initials = profileInitials(profile);
  const training = profile.activities.length === 0 ? 'Aucun' : profile.activities.map((a) => `${ACTIVITY_LABEL[a.type]} ${a.sessionsPerWeek}×`).join(', ');

  return (
    <main className="screen">
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0 28px' }}>
        {initials ? (
          <div className="avatar avatar--profile" aria-hidden="true">
            {initials}
          </div>
        ) : (
          <div style={{ width: 54, height: 54, borderRadius: 18, background: 'var(--accl)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
            <Mascot variant="normal" width={44} />
          </div>
        )}
        <div>
          <h1 style={{ margin: 0, font: '700 20px var(--font-display)', letterSpacing: '-0.02em' }}>{[profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Ton profil'}</h1>
          <div className="eyebrow">
            {GOAL_LABEL[plan.goal]} · {weeks} semaine{weeks > 1 ? 's' : ''} de suivi
          </div>
        </div>
      </header>

      <h2 className="section-label" style={{ marginTop: 0 }}>
        Informations
      </h2>
      <div className="rows">
        <Row label="Âge" value={`${profile.ageYears} ans`} />
        <Row label="Taille" value={formatHeight(profile.heightCm, units)} />
        <Row label="Sexe physiologique" value={profile.sexForEquation === 'female' ? 'Femme' : 'Homme'} />
        <Row label="Poids de départ" value={`${formatWeight(store.meta.initialWeightKg ?? profile.currentWeightKg, units)} ${weightUnitLabel(units)}`} />
        <Row label="Masse grasse" value={profile.bodyFatPercent !== undefined && profile.bodyFatMethod ? `${formatNumber(profile.bodyFatPercent, 0)} % · ${BODY_FAT_METHOD_LABEL[profile.bodyFatMethod].label}` : 'Non renseignée'} />
        {profile.measuredRmr ? <Row label="Métabolisme mesuré" value={`${formatInteger(profile.measuredRmr.kcalPerDay)} kcal · ${formatFullDate(profile.measuredRmr.measuredAt)}`} /> : null}
      </div>

      <h2 className="section-label">Activité</h2>
      <div className="rows">
        <Row label="Pas moyens" value={formatInteger(profile.averageSteps7d)} />
        <Row label="Allure" value={PACE_LABEL[profile.walkingPace]} />
        <Row label="Emploi" value={occupationLabel(profile.occupation, profile.sexForEquation)} />
        <Row label="Entraînements" value={<span style={{ fontSize: 13.5 }}>{training}</span>} />
      </div>
      <button
        type="button"
        className="link"
        style={{ marginTop: 12 }}
        onClick={() => {
          setDraft(() => draftFromProfile(profile, units));
          go('onboarding');
        }}
      >
        Modifier mes informations ›
      </button>

      <h2 className="section-label">Objectif</h2>
      <Segmented label="Objectif" options={(['loss', 'maintenance', 'gain'] as Goal[]).map((g) => ({ value: g, label: GOAL_SHORT[g] }))} value={plan.goal} onChange={() => openSheet('goal')} />
      <button type="button" className="link" style={{ marginTop: 10 }} onClick={() => openSheet('goal')}>
        Changer d’objectif ou de vitesse ›
      </button>

      <div style={{ marginTop: 30 }}>
        <NavRow label="Préférences" onClick={() => go('params')} />
        <NavRow label="Mes données" onClick={() => go('data')} />
      </div>

      <p className="beta-note">
        Version bêta · modèle {SCIENTIFIC_MODEL_VERSION}. Les estimations ne sont pas encore validées sur des données réelles.
      </p>
    </main>
  );
}

export function GoalSheet() {
  const { sheet, closeSheet, showToast, go } = useNav();
  const { store, commit, today } = useWheighty();
  const open = sheet === 'goal';
  const profile = store.profile;
  const plan = store.plan;
  const units = store.preferences.units;
  const weight = currentWeightKg(store) ?? profile?.currentWeightKg ?? 70;
  const [goal, setGoal] = useState<Goal>(plan?.goal ?? 'maintenance');
  const [target, setTarget] = useState<number>(plan?.targetWeightKg ?? weight);
  const [rate, setRate] = useState<number | null>(plan && plan.goal !== 'maintenance' ? (plan.requestedWeeklyRate ?? plan.weeklyRateTarget) : null);
  const [error, setError] = useState<string | null>(null);
  const model = useMemo(() => (open && goal !== 'maintenance' ? storeSpeedSliderModel(store, today, goal) : null), [open, goal, store, today]);

  useEffect(() => {
    if (!open || !plan) return;
    setGoal(plan.goal);
    setTarget(plan.targetWeightKg ?? weight);
    setRate(plan.goal !== 'maintenance' ? (plan.requestedWeeklyRate ?? plan.weeklyRateTarget) : null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !profile || !plan) return null;
  const guard = goalGuardrails(profile.heightCm, weight);
  const pick = (g: Goal) => {
    setGoal(g);
    setTarget(g === 'maintenance' ? Math.round(weight * 10) / 10 : g === 'loss' ? Math.round(weight * 0.95 * 2) / 2 : Math.round(weight * 1.04 * 2) / 2);
    setRate(g === 'maintenance' ? null : g === plan.goal ? (plan.requestedWeeklyRate ?? plan.weeklyRateTarget) : defaultWeeklyRate(g, storeSpeedSliderModel(store, today, g)?.maxSelectableRate ?? null));
    setError(null);
  };
  const min = goal === 'loss' ? Math.max(35, weight * 0.6) : weight + 0.5;
  const max = goal === 'loss' ? weight - 0.5 : weight * 1.35;
  const shownRate = model && model.maxSelectableRate !== null ? Math.min(rate ?? model.defaultRate, model.maxSelectableRate) : null;

  const apply = () => {
    const r = changeGoal(store, today, { goal, targetWeightKg: goal === 'maintenance' ? weight : target, weeklyRate: goal === 'maintenance' ? 0 : (shownRate ?? rate ?? 0) });
    if (!r.ok) {
      setError(PLAN_ERROR_TEXT[r.reason] ?? 'Objectif impossible.');
      return;
    }
    commit(r.store);
    closeSheet();
    showToast('Nouvel objectif appliqué.');
    go('plan');
  };

  return (
    <BottomSheet open onClose={closeSheet} title="Ton objectif" lead="Le plan est recalculé avec ton maintien actuel.">
      <Segmented
        label="Objectif"
        options={(['loss', 'maintenance', 'gain'] as Goal[]).filter((g) => g !== 'loss' || guard.lossAvailable).map((g) => ({ value: g, label: GOAL_SHORT[g] }))}
        value={goal}
        onChange={pick}
      />
      {!guard.lossAvailable ? (
        <p className="small" style={{ margin: '8px 0 0' }}>
          La perte de poids n’est pas proposée avec ton poids actuel.
        </p>
      ) : null}
      {goal === 'maintenance' ? (
        <p className="small" style={{ margin: '24px 0 20px' }}>
          Wheighty vise ton poids actuel ({formatWeight(weight, units)} {weightUnitLabel(units)}), sans vitesse à choisir.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '24px 0 6px' }}>
            <span className="label" style={{ margin: 0 }}>
              Poids cible
            </span>
            <span className="tabular" style={{ font: '600 20px var(--font)' }}>
              {formatWeight(target, units)} {weightUnitLabel(units)}
            </span>
          </div>
          <Range value={Math.min(max, Math.max(min, target))} min={min} max={max} step={units === 'imperial' ? KG_PER_LB : 0.5} onChange={setTarget} label="Poids cible" valueText={`${formatWeight(target, units)} ${weightUnitLabel(units)}`} />
          <p className="small" style={{ margin: '4px 0 20px' }}>
            {formatSignedWeight(target - weight, units)} {weightUnitLabel(units)} par rapport à ta tendance actuelle.
          </p>
        </>
      )}
      {model && shownRate !== null ? <SpeedSlider model={model} value={shownRate} onChange={setRate} units={units} /> : null}
      {goal !== 'maintenance' && model && model.maxSelectableRate === null ? (
        <p className="small" style={{ margin: 0 }}>
          Aucune vitesse ne respecte les limites de sécurité pour ce profil. Le maintien reste disponible.
        </p>
      ) : null}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn btn--primary" style={{ marginTop: 22 }} onClick={apply}>
        Recalculer mon plan
      </button>
    </BottomSheet>
  );
}

export function ParamsScreen() {
  const { back } = useNav();
  const { store, update } = useWheighty();
  const pwa = usePwa();
  const [consentOpen, setConsentOpen] = useState(false);
  const prefs = store.preferences;
  const setPrefs = (p: Partial<WheightyStore['preferences']>) => update((s) => ({ ...s, preferences: { ...s.preferences, ...p } }));

  return (
    <main className="screen">
      <button type="button" className="back" onClick={back}>
        ‹ Profil
      </button>
      <h1 className="h-page" style={{ marginBottom: 30 }}>
        Préférences
      </h1>
      <span className="label" style={{ fontSize: 12.5 }}>
        Thème
      </span>
      <Segmented
        label="Thème"
        options={[
          { value: 'light', label: 'Clair' },
          { value: 'dark', label: 'Sombre' },
          { value: 'system', label: 'Système' },
        ]}
        value={prefs.theme}
        onChange={(v) => setPrefs({ theme: v })}
      />
      <div style={{ height: 30 }} />
      <span className="label" style={{ fontSize: 12.5 }}>
        Unités
      </span>
      <Segmented
        label="Unités"
        options={[
          { value: 'metric', label: 'kg · cm' },
          { value: 'imperial', label: 'lb · ft' },
        ]}
        value={prefs.units}
        onChange={(v) => setPrefs({ units: v })}
      />
      <div style={{ height: 30 }} />
      <div className="row" style={{ alignItems: 'center', padding: '16px 0' }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', font: '600 14.5px var(--font)' }}>Rappel de pesée</span>
          <span style={{ display: 'block', font: '400 12.5px var(--font)', color: 'var(--ink2)', marginTop: 2 }}>Tous les 3 jours, affiché dans l’app (pas de notification)</span>
        </span>
        <Toggle checked={prefs.weighInReminder} onChange={(v) => setPrefs({ weighInReminder: v })} label="Rappel de pesée" />
      </div>
      <div className="row" style={{ alignItems: 'center', padding: '16px 0' }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', font: '600 14.5px var(--font)' }}>{PRODUCT_SEARCH_TEXT.settingTitle}</span>
          <span style={{ display: 'block', font: '400 12.5px var(--font)', color: 'var(--ink2)', marginTop: 2 }}>{PRODUCT_SEARCH_TEXT.settingHint}</span>
        </span>
        <Toggle checked={prefs.productSearchEnabled} onChange={(v) => (v ? setConsentOpen(true) : setPrefs({ productSearchEnabled: false }))} label={PRODUCT_SEARCH_TEXT.settingTitle} />
      </div>
      {/* E2: last preference of the screen. */}
      <div className="row" style={{ alignItems: 'center', padding: '16px 0' }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', font: '600 14.5px var(--font)' }}>Détails scientifiques</span>
          <span style={{ display: 'block', font: '400 12.5px var(--font)', color: 'var(--ink2)', marginTop: 2 }}>Afficher les formules et valeurs brutes dans les écrans</span>
        </span>
        <Toggle checked={prefs.showScientificDetails} onChange={(v) => setPrefs({ showScientificDetails: v })} label="Détails scientifiques" />
      </div>

      <h2 className="section-label">{DATA_SOURCES_TEXT.title}</h2>
      <p className="small" style={{ margin: '0 0 10px' }}>
        {DATA_SOURCES_TEXT.ciqual}
      </p>
      <p className="small" style={{ margin: 0 }}>
        {DATA_SOURCES_TEXT.off}
      </p>

      <BottomSheet open={consentOpen} onClose={() => setConsentOpen(false)} title={PRODUCT_SEARCH_TEXT.consentTitle} lead={PRODUCT_SEARCH_TEXT.consentLead}>
        <ul className="small" style={{ margin: '0 0 20px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <li>{PRODUCT_SEARCH_TEXT.consentSent}</li>
          <li>{PRODUCT_SEARCH_TEXT.consentNeverSent}</li>
          <li>{PRODUCT_SEARCH_TEXT.consentIp}</li>
          <li>{PRODUCT_SEARCH_TEXT.consentOffline}</li>
        </ul>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            setPrefs({ productSearchEnabled: true });
            setConsentOpen(false);
          }}
        >
          {PRODUCT_SEARCH_TEXT.consentConfirm}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setConsentOpen(false)}>
          {PRODUCT_SEARCH_TEXT.consentCancel}
        </button>
      </BottomSheet>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 34, padding: 18, borderRadius: 22, background: 'var(--surf2)' }}>
        <Mascot variant="clin" width={44} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, font: '400 13px/1.5 var(--font)' }}>Wheighty s’installe sur ton écran d’accueil et fonctionne hors connexion.</p>
          {pwa.canInstall ? (
            <button type="button" className="link" style={{ marginTop: 6 }} onClick={pwa.install}>
              Installer l’application
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useExport() {
  const { store, today, nowIso } = useWheighty();
  const { showToast } = useNav();
  return () => {
    downloadText(exportFileName(today), exportStore(store, nowIso()));
    showToast('Export prêt : garde ce fichier en lieu sûr.');
  };
}

export function DataScreen() {
  const { back, go, showToast } = useNav();
  const { store, commit, update, saveError } = useWheighty();
  const doExport = useExport();
  const fileRef = useRef<HTMLInputElement>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  // E1: clearing "Mes aliments" lives with the data, and is confirmed.
  const [clearOpen, setClearOpen] = useState(false);
  const libraryCount = store.foodJournal.library.length;
  const loggedDays = store.dailyLogs.filter((l) => l.adherence).length;
  const recalibrations = appliedWeightCalibrations(store);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setImported(parseImport(text));
  };

  return (
    <main className="screen">
      <button type="button" className="back" onClick={back}>
        ‹ Profil
      </button>
      <h1 className="h-page" style={{ marginBottom: 8 }}>
        Mes données
      </h1>
      <p style={{ margin: '0 0 30px', font: '400 14px/1.55 var(--font)', color: 'var(--ink2)' }}>Tes données restent sur cet appareil. Aucun compte, aucun serveur.</p>
      {saveError ? (
        <div className="note note--warn" style={{ marginBottom: 20 }}>
          <Mascot variant="search" width={40} />
          <span>L’enregistrement local a échoué (stockage plein ou bloqué). Exporte tes données par sécurité.</span>
        </div>
      ) : null}
      {store.meta.recoveredCorruptData ? (
        <div className="note" style={{ marginBottom: 20 }}>
          <Mascot variant="search" width={40} />
          <span>Des données illisibles ont été retrouvées au démarrage. Une copie brute a été conservée sur l’appareil ({store.meta.recoveredCorruptData.key}).</span>
        </div>
      ) : null}

      <div className="card" style={{ display: 'flex', gap: 26, padding: 20, marginBottom: 26 }}>
        {(
          [
            [store.weights.length, 'pesées'],
            [loggedDays, 'jours notés'],
            [recalibrations, 'recalibrations'],
          ] as const
        ).map(([n, l]) => (
          <div key={l}>
            <div className="tabular" style={{ font: '600 26px var(--font)' }}>
              {formatInteger(n)}
            </div>
            <div style={{ font: '500 11.5px var(--font)', color: 'var(--ink2)', marginTop: 3 }}>{l}</div>
          </div>
        ))}
      </div>

      <button type="button" className="btn btn--outline" style={{ marginBottom: 10 }} onClick={doExport}>
        Exporter mes données (.json)
      </button>
      <button type="button" className="btn btn--outline" style={{ marginBottom: 26 }} onClick={() => fileRef.current?.click()}>
        Importer un fichier
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <div className="divider" style={{ marginBottom: 22 }} />
      <div className="row" style={{ alignItems: 'center', padding: '0 0 18px', border: 0 }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', font: '600 14.5px var(--font)' }}>{PRODUCT_SEARCH_TEXT.clearCache}</span>
          <span style={{ display: 'block', font: '400 12.5px var(--font)', color: 'var(--ink2)', marginTop: 2 }}>
            {libraryCount > 0 ? PRODUCT_SEARCH_TEXT.clearCount(libraryCount) : PRODUCT_SEARCH_TEXT.clearEmpty}
          </span>
        </span>
        <button type="button" className="btn btn--outline btn--small" disabled={libraryCount === 0} onClick={() => setClearOpen(true)}>
          {PRODUCT_SEARCH_TEXT.clearConfirm}
        </button>
      </div>
      <button type="button" className="btn" style={{ background: 'transparent', color: 'var(--danger)', textAlign: 'left', fontSize: 15 }} onClick={() => go('delete')}>
        Supprimer toutes mes données
      </button>

      <BottomSheet open={clearOpen} onClose={() => setClearOpen(false)} title={PRODUCT_SEARCH_TEXT.clearConfirmTitle} lead={PRODUCT_SEARCH_TEXT.clearConfirmLead}>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            update((s) => clearLibrary(s));
            setClearOpen(false);
            showToast(PRODUCT_SEARCH_TEXT.cacheCleared);
          }}
        >
          {PRODUCT_SEARCH_TEXT.clearConfirm}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setClearOpen(false)}>
          {PRODUCT_SEARCH_TEXT.clearCancel}
        </button>
      </BottomSheet>

      <BottomSheet
        open={imported !== null}
        onClose={() => setImported(null)}
        title={imported?.ok ? 'Remplacer tes données ?' : 'Import impossible'}
        lead={
          imported?.ok
            ? `Ce fichier contient ${imported.summary.weights} pesées, ${imported.summary.dailyLogs} jours, ${imported.summary.calibrations} recalibrations et ${imported.summary.foodEntries} aliments du journal. Tes données actuelles seront remplacées.`
            : imported && !imported.ok
              ? imported.error === 'invalid_json'
                ? 'Ce fichier n’est pas un JSON lisible.'
                : imported.error === 'unsupported_version'
                  ? 'Ce fichier vient d’une version plus récente de Wheighty.'
                  : imported.error === 'not_wheighty_export'
                    ? 'Ce fichier ne ressemble pas à un export Wheighty.'
                    : 'Le contenu du fichier est incomplet ou invalide. Rien n’a été modifié.'
              : ''
        }
      >
        {imported?.ok ? (
          <>
            <button type="button" className="btn btn--outline" style={{ marginBottom: 10 }} onClick={doExport}>
              Exporter d’abord mes données actuelles
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                commit(imported.store);
                setImported(null);
                showToast('Données importées.');
                go(imported.store.plan ? 'today' : 'intro', { replace: true });
              }}
            >
              Remplacer mes données
            </button>
          </>
        ) : null}
        <button type="button" className="btn btn--ghost" onClick={() => setImported(null)}>
          {imported?.ok ? 'Annuler' : 'Fermer'}
        </button>
      </BottomSheet>
    </main>
  );
}

export function DeleteScreen() {
  const { go } = useNav();
  const { store, wipe, today } = useWheighty();
  const [ok, setOk] = useState(false);
  const doExport = useExport();
  const weeks = weeksOfTracking(store, today);
  const recalibrations = appliedWeightCalibrations(store);

  return (
    <main className="screen--moment">
      <div style={{ display: 'grid', placeItems: 'center', margin: '40px 0 24px' }}>
        <Mascot variant="search" width={82} />
      </div>
      <h1 style={{ margin: 0, textAlign: 'center', font: '700 25px/1.3 var(--font-display)', letterSpacing: '-0.025em' }}>
        Supprimer toutes
        <br />
        tes données ?
      </h1>
      <p style={{ margin: '14px 0 0', textAlign: 'center', font: '400 14.5px/1.6 var(--font)', color: 'var(--ink2)' }}>
        {store.weights.length} pesée{store.weights.length > 1 ? 's' : ''}, {weeks} semaine{weeks > 1 ? 's' : ''} de suivi et {recalibrations} recalibration{recalibrations > 1 ? 's' : ''}, ton journal alimentaire et les produits consultés seront effacés de cet appareil. C’est définitif et sans retour possible.
      </p>
      <div style={{ margin: '30px 0 0', padding: 18, borderRadius: 20, background: 'var(--surf2)' }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Avant de continuer
        </div>
        <button type="button" className="btn btn--outline" style={{ fontSize: 14 }} onClick={doExport}>
          Exporter une sauvegarde
        </button>
      </div>
      <button type="button" role="checkbox" aria-checked={ok} className="checkbox" onClick={() => setOk(!ok)}>
        <span className="checkbox__box" aria-hidden="true">
          {ok ? '✓' : ''}
        </span>
        <span>Je comprends que ces données ne pourront pas être récupérées.</span>
      </button>
      <div className="spacer" />
      <button
        type="button"
        className={`btn ${ok ? 'btn--danger' : ''}`}
        disabled={!ok}
        style={ok ? undefined : { background: 'var(--surf2)', color: 'var(--ink2)' }}
        onClick={() => {
          wipe();
          go('intro', { replace: true });
        }}
      >
        Supprimer définitivement
      </button>
      <button type="button" className="btn btn--ghost" style={{ color: 'var(--ink)', fontWeight: 600 }} onClick={() => go('data', { replace: true })}>
        Annuler
      </button>
    </main>
  );
}

export function ReachedScreen() {
  const { go, openSheet, showToast } = useNav();
  const { store, commit, today } = useWheighty();
  const plan = store.plan;
  const weight = currentWeightKg(store);
  if (!plan || weight === null) return null;
  const units = store.preferences.units;
  const initial = store.meta.initialWeightKg ?? weight;
  const weeks = weeksOfTracking(store, today);

  return (
    <main className="screen--moment">
      <div style={{ display: 'grid', placeItems: 'center', margin: '46px 0 26px' }}>
        <Mascot variant="heureux" width={116} float />
      </div>
      <p className="eyebrow" style={{ textAlign: 'center', fontSize: 13, margin: 0 }}>
        Objectif atteint
      </p>
      <h1 style={{ margin: '6px 0 0', textAlign: 'center', font: '700 28px/1.25 var(--font-display)', letterSpacing: '-0.03em' }}>
        {formatWeight(plan.targetWeightKg ?? weight, units)} {weightUnitLabel(units)}.
        <br />
        Tu y es.
      </h1>
      <p style={{ margin: '16px 0 0', textAlign: 'center', font: '400 14.5px/1.6 var(--font)', color: 'var(--ink2)' }}>
        {weeks} semaine{weeks > 1 ? 's' : ''}, {formatSignedWeight(weight - initial, units)} {weightUnitLabel(units)} de tendance. On passe en maintien ?
      </p>
      <div style={{ display: 'flex', gap: 12, margin: '34px 0 0' }}>
        {(
          [
            [formatSignedWeight(weight - initial, units), `${weightUnitLabel(units)} au total`],
            [String(weeks), 'semaines'],
            [formatKcal(plan.maintenanceKcal), 'maintien'],
          ] as const
        ).map(([v, l]) => (
          <div key={l} className="card" style={{ flex: 1, textAlign: 'center', padding: '18px 10px', borderRadius: 20 }}>
            <div className="tabular" style={{ font: '600 26px var(--font)' }}>
              {v}
            </div>
            <div style={{ font: '500 11.5px var(--font)', color: 'var(--ink2)', marginTop: 4 }}>{l}</div>
          </div>
        ))}
      </div>
      <div className="spacer" />
      <button
        type="button"
        className="btn btn--primary"
        style={{ marginTop: 26 }}
        onClick={() => {
          const r = changeGoal(store, today, { goal: 'maintenance', targetWeightKg: Math.round(weight * 10) / 10, weeklyRate: 0 });
          if (!r.ok) {
            showToast(PLAN_ERROR_TEXT[r.reason] ?? 'Impossible de passer en maintien.');
            return;
          }
          commit(r.store);
          go('plan', { replace: true });
        }}
      >
        Passer en maintien
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => {
          go('plan', { replace: true });
          window.setTimeout(() => openSheet('goal'), 50);
        }}
      >
        Choisir un nouvel objectif
      </button>
    </main>
  );
}
