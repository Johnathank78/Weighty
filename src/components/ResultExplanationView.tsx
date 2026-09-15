import type { ReactNode } from 'react';
import {
  ACTIVITY_LABEL,
  CONFIDENCE_LABEL,
  GATE_CRITERION_LABEL,
  GOAL_LABEL,
  HISTORY_UNUSED_TEXT,
  INTENSITY_LABEL,
  LIMITING_RULE_TEXT,
  MAINTENANCE_SOURCE_TEXT,
  OCCUPATION_LABEL,
  PAL_CATEGORY_TITLE,
  PROTEIN_RULE_TEXT,
  REE_METHOD_LABEL,
  REE_REASON_TEXT,
  SIGMA_REASON_LABEL,
  SIGNAL_LABEL,
  sourcesSentence,
  TRACKING_QUALITY_SHORT,
  WARM_START_TEXT,
  WHY_TEXT,
} from '@/app/copy';
import { ConfidenceGauge } from '@/components/controls';
import type { ResultExplanation } from '@/domain/explain';
import {
  formatApproximateFraction,
  formatInteger,
  formatKcal,
  formatKcalRangeRounded,
  formatNumber,
  formatRatePercent,
  formatSteps,
  formatWeight,
  kgToLb,
  MINUS,
  weightUnitLabel,
} from '@/domain/format';
import type { UnitPreference } from '@/domain/types';
import { gateCriterionValue } from '@/domain/views';

/** Formatting and layout only: every value comes from the domain explanation view model (D-25, D-30). */

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="why-block">
      <h4 className="why-block__title">{title}</h4>
      {children}
    </section>
  );
}

function Line({ children }: { children: ReactNode }) {
  return <p className="why-block__line">{children}</p>;
}

/** Secondary explanation under a value: same wording, lighter weight so the figures lead. */
function Note({ children }: { children: ReactNode }) {
  return <p className="why-note">{children}</p>;
}

/** Compact input tile (activity inputs); `wide` spans the whole row. */
function Tile({ label, value, sub, wide = false }: { label: string; value: string; sub?: string; wide?: boolean }) {
  return (
    <div className={`why-tile${wide ? ' why-tile--wide' : ''}`}>
      <span className="why-tile__label">{label}</span>
      <span className="why-tile__value tabular">{value}</span>
      {sub ? <span className="why-tile__sub">{sub}</span> : null}
    </div>
  );
}

/** Headline figure followed by its unit; several sit side by side. */
function Stat({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="why-stat">
      <span className="why-stat__value tabular">{value}</span>
      <span className="why-stat__unit">{unit}</span>
    </div>
  );
}

function Info({ children }: { children: ReactNode }) {
  return (
    <div className="why-info">
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="4.8" r="1" fill="currentColor" />
      </svg>
      <p>{children}</p>
    </div>
  );
}

type CompareRow = { key: 'theoretical' | 'history' | 'retained'; label: string; kcal: number; interval: readonly [number, number] };

function comparisonRows(x: ResultExplanation): CompareRow[] {
  const rows: CompareRow[] = [{ key: 'theoretical', label: WHY_TEXT.theoretical, kcal: x.population.tdeeKcal, interval: x.population.interval80 }];
  const h = x.history;
  if (h?.status === 'used' && h.historyOnly) rows.push({ key: 'history', label: WHY_TEXT.history, kcal: h.historyOnly.medianKcal, interval: h.historyOnly.interval80 });
  if (x.maintenance.source !== 'population') rows.push({ key: 'retained', label: WHY_TEXT.retained, kcal: x.maintenance.kcal, interval: x.maintenance.interval80 });
  return rows;
}

/** Three estimates on one common scale, so the overlap of the ranges is visible at a glance. */
function Comparison({ x }: { x: ResultExplanation }) {
  const rows = comparisonRows(x);
  const step = x.thresholds.rangeRoundingKcal;
  const lo = Math.min(...rows.map((r) => r.interval[0]));
  const hi = Math.max(...rows.map((r) => r.interval[1]));
  const pad = (hi - lo) * 0.04;
  const at = (v: number) => `${(((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100).toFixed(2)}%`;
  return (
    <div className="why-compare">
      {rows.map((r) => (
        <div key={r.key} className="why-compare__row" data-kind={r.key}>
          <div className="why-compare__head">
            <span>{r.label}</span>
            <span className="tabular">{formatKcal(r.kcal)} kcal / jour</span>
          </div>
          <div className="why-compare__track" aria-hidden="true">
            <i className="why-compare__range" style={{ left: at(r.interval[0]), right: `calc(100% - ${at(r.interval[1])})` }} />
            <b className="why-compare__dot" style={{ left: at(r.kcal) }} />
          </div>
          <div className="why-compare__note tabular">Fourchette 80 % : {formatKcalRangeRounded(r.interval, step)} kcal</div>
        </div>
      ))}
    </div>
  );
}

export function ResultExplanationDigest({ x, units }: { x: ResultExplanation; units: UnitPreference }) {
  const u = weightUnitLabel(units);
  const h = x.history;
  const used = h?.status === 'used';
  const historyPct = x.sources ? Math.round(x.sources.historyWeight * 100) : null;
  return (
    <div>
      <Block title={WHY_TEXT.comparisonTitle}>
        <Comparison x={x} />
        <Note>{WHY_TEXT.apparentMaintenance}</Note>
        {x.maintenance.source !== 'warm_start' ? <Line>{MAINTENANCE_SOURCE_TEXT[x.maintenance.source]}</Line> : null}
        {h && !used ? <Line>{HISTORY_UNUSED_TEXT[h.status === 'used' ? 'invalid' : h.status]}</Line> : null}
        {h?.conflict ? <Line>{WARM_START_TEXT.conflict}</Line> : null}
      </Block>

      {x.sources && historyPct !== null ? (
        <Block title={WHY_TEXT.sourcesTitle}>
          <div className="why-weights" role="img" aria-label={`${WHY_TEXT.theoretical} ${100 - historyPct} %, ${WHY_TEXT.history.toLowerCase()} ${historyPct} %`}>
            <i className="why-weights__theory" style={{ width: `${100 - historyPct}%` }} />
            <i className="why-weights__history" style={{ width: `${historyPct}%` }} />
          </div>
          <div className="why-weights__legend tabular">
            <span>
              {WHY_TEXT.theoretical} {100 - historyPct} %
            </span>
            <span>
              {WHY_TEXT.history} {historyPct} %
            </span>
          </div>
          <Info>{sourcesSentence(formatApproximateFraction(x.sources.historyWeight))}</Info>
        </Block>
      ) : null}

      <Block title="Métabolisme de repos">
        <div className="why-stats">
          <Stat value={formatKcal(x.ree.kcal)} unit="kcal / jour" />
        </div>
        <Note>{REE_REASON_TEXT[x.ree.reason]}</Note>
      </Block>

      <Block title="Activité prise en compte">
        <div className="why-tiles">
          <Tile label="Pas" value={`${formatInteger(x.activity.stepsPerDay)} / jour`} />
          <Tile label="Travail" value={OCCUPATION_LABEL[x.activity.occupation]} />
          <Tile label="Catégorie" value={PAL_CATEGORY_TITLE[x.population.palCategory]} />
          {x.activity.activities.length === 0 ? <Tile wide label="Entraînement" value="Aucun entraînement structuré" /> : null}
          {x.activity.activities.map((a, i) => (
            <Tile
              key={`${a.type}-${i}`}
              wide
              label={ACTIVITY_LABEL[a.type]}
              value={`${a.sessionsPerWeek} séance${a.sessionsPerWeek > 1 ? 's' : ''} de ${formatInteger(a.durationMin)} min / semaine`}
              sub={`Intensité ${INTENSITY_LABEL[a.intensity].toLowerCase()}`}
            />
          ))}
          {h ? (
            <Tile
              wide
              label="Ton historique"
              value={`${formatInteger(h.evidence.averageCaloriesKcal)} kcal / jour pendant ${formatInteger(h.evidence.durationDays)} jour${h.evidence.durationDays > 1 ? 's' : ''}`}
              sub={`${h.evidence.startWeightKg === null ? 'Poids de départ non renseigné' : `${formatWeight(h.evidence.startWeightKg, units)} → ${formatWeight(h.evidence.endWeightKg, units)} ${u}`} · ${TRACKING_QUALITY_SHORT[h.evidence.trackingQuality]}`}
            />
          ) : null}
        </div>
        {x.activity.palBoundaryFlag ? <Note>{WHY_TEXT.palBoundary}</Note> : null}
      </Block>

      <Block title={`Ton objectif : ${GOAL_LABEL[x.goal.goal].toLowerCase()}`}>
        {x.goal.goal === 'maintenance' ? (
          <p className="why-lead">Garder ton poids actuel</p>
        ) : (
          <>
            <div className="why-stats">
              <Stat value={formatRatePercent(x.goal.appliedWeeklyRate)} unit="par semaine" />
              <Stat value={`≈ ${formatNumber(units === 'imperial' ? kgToLb(x.goal.appliedKgPerWeek) : x.goal.appliedKgPerWeek, 2)}`} unit={`${u} par semaine`} />
            </div>
            {x.goal.rateAdjusted ? (
              <Info>
                Tu avais demandé {formatRatePercent(x.goal.requestedWeeklyRate)} par semaine. {x.goal.limitingRule ? LIMITING_RULE_TEXT[x.goal.limitingRule] : 'La vitesse a été ajustée pour respecter les limites de sécurité.'}
              </Info>
            ) : null}
          </>
        )}
      </Block>

      <Block title="Prescription">
        <div className="why-stats">
          <Stat value={formatKcal(x.prescription.calorieTargetKcal)} unit="kcal / jour" />
          <Stat value={formatSteps(x.prescription.stepTarget)} unit="pas / jour" />
        </div>
        {x.solve ? (
          <Note>
            C’est l’apport constant qui amène le modèle dynamique du poids à {formatWeight(x.solve.targetWeightAtHorizonKg, units)} {u} au jour {x.solve.horizonDays}
            {x.goal.goal === 'maintenance' ? ', c’est-à-dire à ton poids actuel.' : '.'}
          </Note>
        ) : null}
        {x.prescription.stepsAdjusted ? <Note>Calories ajustées à ton objectif de pas.</Note> : null}
        {x.safety.atHardFloor ? <Note>Ce niveau correspond à ton plancher calorique.</Note> : null}
      </Block>

      <Block title={WHY_TEXT.gateTitle}>
        <ConfidenceGauge level={x.maintenance.confidence} label="Confiance actuelle" />
        <Note>{x.gate.met ? WHY_TEXT.gateMet : WHY_TEXT.gateIntro}</Note>
        <div className="why-gate">
          {x.gate.criteria.map((c) => (
            <div key={c.key} className="gate-row" data-met={c.met}>
              <div className="gate-row__head">
                <span>{GATE_CRITERION_LABEL[c.key]}</span>
                <span className="tabular">{gateCriterionValue(c)}</span>
              </div>
              <div className="gate-row__bar" aria-hidden="true">
                <i style={{ width: `${Math.round(c.fill * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}

/** Digest always; the grouped technical values only when the "Détails scientifiques" preference is on. */
export function ResultExplanationView({ x, units, details }: { x: ResultExplanation; units: UnitPreference; details: boolean }) {
  return (
    <>
      <ResultExplanationDigest x={x} units={units} />
      {details ? (
        <ResultExplanationDetails x={x} />
      ) : (
        <p className="small" style={{ margin: '4px 0 20px' }}>
          Active « Détails scientifiques » dans les préférences pour voir toutes les valeurs du calcul.
        </p>
      )}
    </>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="why-kv">
      <span>{k}</span>
      <span className="tabular">{v}</span>
    </div>
  );
}

function Group({ id, title, badge, open, children }: { id: string; title: string; badge?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="why-group" data-group={id} open={open}>
      <summary className="why-group__summary">
        <span>{title}</span>
        {badge ? <span className="why-group__badge">{badge}</span> : null}
      </summary>
      <div className="why-group__body">{children}</div>
    </details>
  );
}

const yesNo = (b: boolean) => (b ? 'oui' : 'non');
const kcal = (n: number) => `${formatInteger(n)} kcal/j`;
const signed = (n: number, decimals = 0) => `${n > 0 ? '+' : n < 0 ? MINUS : ''}${decimals === 0 ? formatInteger(Math.abs(n)) : formatNumber(Math.abs(n), decimals)}`;
const range = (i: readonly [number, number]) => `${formatInteger(i[0])} à ${formatInteger(i[1])}`;
const mass = (p: number) => (p < 0.0001 ? '< 0,01 %' : `${formatNumber(p * 100, 2)} %`);
const pct = (p: number) => `${formatInteger(p * 100)} %`;

export function ResultExplanationDetails({ x }: { x: ResultExplanation }) {
  const h = x.history;
  const used = h?.status === 'used';
  const integrity = x.integrity;
  const badge = integrity === null ? `Aperçu, modèle ${x.modelVersion}` : x.matchesStoredPlan ? 'Recalcul conforme au plan enregistré' : 'Écart avec le plan enregistré';
  const pb = x.activity.palBoundary;
  const conf = x.confidenceDetail;
  const root = h?.exactRoot ?? null;
  const bound = x.thresholds.incoherentOffsetBoundKcal;
  const dom = h?.hallDomain ?? null;
  const edge = h?.historyOnlyEdgeMass ?? null;
  const warnings = Object.entries(x.safety.warnings)
    .filter(([, on]) => on)
    .map(([k]) => k);
  return (
    <div className="why-details" aria-label="Détails scientifiques">
      <Group id="integrity" title="A. Intégrité" badge={badge}>
        <Kv k="Version du modèle" v={x.modelVersion} />
        {x.storedPlanModelVersion !== null ? <Kv k="Plan enregistré avec le modèle" v={x.storedPlanModelVersion} /> : null}
        {integrity ? (
          <>
            <Kv k="Même version" v={yesNo(integrity.versionMatches)} />
            <Kv k="Calories recalculées à l’offset enregistré" v={integrity.caloriesMatch ? 'identiques' : `écart ${signed(integrity.calorieDiffKcal, 1)} kcal/j`} />
            {integrity.offset ? (
              <Kv
                k="Offset du warm start enregistré / recalculé"
                v={`${signed(integrity.offset.storedKcal)} / ${signed(integrity.offset.recomputedKcal)} kcal/j (écart ${signed(integrity.offset.diffKcal)}, tolérance ${formatInteger(integrity.offset.toleranceKcal)})`}
              />
            ) : null}
            <Kv k="Recalcul conforme au plan enregistré" v={yesNo(x.matchesStoredPlan === true)} />
          </>
        ) : (
          <Kv k="Plan enregistré" v="aucun (aperçu avant enregistrement)" />
        )}
      </Group>

      <Group id="metabolism" title="B. Métabolisme et activité">
        <Kv k="Route du REE" v={REE_METHOD_LABEL[x.ree.method]} />
        <Kv k="REE" v={kcal(x.ree.kcal)} />
        <Kv k="Calorimétrie mesurée" v={x.ree.measuredRmr} />
        <Kv k="Profil sportif" v={yesNo(x.ree.athleteLike)} />
        <Kv k="Désaccord REE (FFM)" v={yesNo(x.ree.disagreementFlag)} />
        <Kv k="Énergie nette des pas" v={kcal(x.activity.netStepKcal)} />
        <Kv k="Exercice structuré (net)" v={kcal(x.activity.exerciseNetKcalBeforeOverlap)} />
        {x.activity.anyStepDominant ? (
          <>
            <Kv k="Chevauchement retiré (pas déjà comptés)" v={kcal(x.activity.overlapRemovedKcal)} />
            <Kv k="Exercice ajouté après chevauchement" v={kcal(x.activity.exerciseKcalAfterOverlap)} />
          </>
        ) : null}
        <Kv k="Posture" v={kcal(x.activity.postureKcal)} />
        <Kv k="PAL provisoire" v={`${formatNumber(x.activity.provisionalPal, 3)}${x.activity.palBoundaryFlag ? ' (frontière)' : ''}`} />
        <Kv
          k="Frontière la plus proche"
          v={`${formatNumber(pb.boundary, 2)} : ${signed(pb.distancePal, 3)} PAL${pb.nasemDeltaKcal !== null && pb.adjacentCategory ? `, soit ${signed(pb.nasemDeltaKcal)} kcal/j de NASEM (${PAL_CATEGORY_TITLE[pb.adjacentCategory].toLowerCase()})` : ', sans changement de catégorie'}`}
        />
        <Kv k="Catégorie PAL retenue" v={`${PAL_CATEGORY_TITLE[x.population.palCategory]}${x.activity.physicalOccupationFloorApplied ? ' (plancher métier physique)' : ''}`} />
      </Group>

      <Group id="prior" title="C. Prior populationnel">
        <Kv k="NASEM" v={kcal(x.population.tdeeKcal)} />
        <Kv
          k="Sigma"
          v={`${formatInteger(x.population.baseSigmaKcal)}${x.population.sigmaMultipliers.map((m) => ` × ${formatNumber(m.factor, 2)} (${SIGMA_REASON_LABEL[m.reason] ?? m.reason})`).join('')} = ${formatInteger(x.population.sigmaKcal)} kcal/j`}
        />
        <Kv k="Prior 80 %" v={range(x.population.interval80)} />
        <Kv k="Prior 95 %" v={range(x.population.interval95)} />
      </Group>

      <Group id="history" title="D. Évidence historique" open>
        {!h ? (
          <Kv k="Historique" v="aucun" />
        ) : (
          <>
            <Kv k="Statut" v={h.status} />
            {Math.abs(h.populationTdeeAtStartKcal - x.population.tdeeKcal) >= 0.5 ? <Kv k="NASEM au poids de début d’historique" v={kcal(h.populationTdeeAtStartKcal)} /> : null}
            {used && h.historyOnly ? (
              <>
                <Kv k="Historique seul, support exact (source de vérité)" v={`${kcal(h.historyOnly.medianKcal)}, SD ${formatInteger(h.historyOnly.sdKcal)}`} />
                <Kv k="Historique seul 80 % / 95 %" v={`${range(h.historyOnly.interval80)} / ${range(h.historyOnly.interval95)}`} />
              </>
            ) : null}
            {h.linearised ? (
              <Kv k="Offset linéarisé (approximation diagnostique, aucune décision ne l’utilise depuis 1.2.0)" v={`${signed(h.linearised.offsetKcal)} ± ${formatInteger(h.linearised.sdKcal)} kcal/j`} />
            ) : null}
            {h.exactMinusLinearisedKcal !== null ? <Kv k="Écart exact moins linéarisé" v={`${signed(h.exactMinusLinearisedKcal)} kcal/j`} /> : null}
            {edge ? (
              <>
                <Kv k="Masse aux bords, grille (5 / 10 bins)" v={`bas ${mass(edge.grid.lower5)} / ${mass(edge.grid.lower10)}, haut ${mass(edge.grid.upper5)} / ${mass(edge.grid.upper10)}`} />
                <Kv k="Masse aux bords, support (5 / 10 bins)" v={`bas ${mass(edge.evidenceSupport.lower5)} / ${mass(edge.evidenceSupport.lower10)}, haut ${mass(edge.evidenceSupport.upper5)} / ${mass(edge.evidenceSupport.upper10)}`} />
              </>
            ) : null}
            {root ? (
              <Kv
                k="Racine exacte de prédit = observé"
                v={
                  root.rootOffsetKcal === null
                    ? `hors support (${root.position === 'below_support' ? 'en dessous' : 'au-dessus'})`
                    : `${signed(root.rootOffsetKcal)} kcal/j, ${formatInteger(Math.abs(root.distanceToBoundKcal ?? 0))} kcal/j ${(root.distanceToBoundKcal ?? 0) > 0 ? 'au-delà de' : 'en deçà de'} la borne ±${formatInteger(bound)}`
                }
              />
            ) : null}
            {used ? (
              <Kv
                k="Incohérent"
                v={`${yesNo(h.incoherent)}${root?.distanceToBoundKcal !== null && root?.distanceToBoundKcal !== undefined ? (h.incoherent ? `, ${formatInteger(root.distanceToBoundKcal)} kcal/j au-delà du déclenchement` : `, déclenchement dans ${formatInteger(-root.distanceToBoundKcal)} kcal/j`) : ''} ; signal sans effet numérique depuis 1.2.0`}
              />
            ) : null}
            {h.conflictZ !== null ? (
              <Kv k="Conflit (z prédictif)" v={`${yesNo(h.conflict)}, z ${formatNumber(h.conflictZ, 2)}, seuil ±${formatNumber(x.thresholds.conflictZ, 0)} (marge ${formatNumber(x.thresholds.conflictZ - Math.abs(h.conflictZ), 2)})`} />
            ) : null}
            {dom ? (
              <>
                <Kv
                  k="Maximum de vraisemblance et seuil B2 (δ ramené à 0)"
                  v={`${signed(dom.likelihoodArgmaxOffsetKcal)} kcal/j, ${formatInteger(Math.abs(dom.argmaxMinusDeltaClampKcal))} kcal/j ${dom.argmaxMinusDeltaClampKcal < 0 ? 'sous le' : 'au-dessus du'} seuil (${signed(dom.deltaClampOffsetKcal)})`}
                />
                <Kv k="Points exclus par le domaine de Hall" v={`grille ${formatInteger(dom.excludedOffsetCount)}, support ${formatInteger(dom.supportExcludedOffsetCount)}`} />
              </>
            ) : null}
            {h.uncertainty ? (
              <Kv
                k="Incertitudes de l’historique"
                v={`pesée ${formatNumber(h.uncertainty.endpointWeightSdKg, 2)} kg, apport ${formatInteger(h.uncertainty.intakeSdKcal)}, activité ${formatInteger(h.uncertainty.activitySdKcal)}, modèle ${formatInteger(h.uncertainty.modelSdKcal)} kcal/j`}
              />
            ) : null}
          </>
        )}
      </Group>

      <Group id="fusion" title="E. Fusion et confiance" open>
        <Kv k="Source du maintien" v={x.maintenance.source} />
        <Kv k="Maintien retenu (posterior)" v={kcal(x.maintenance.kcal)} />
        <Kv k="Offset personnel" v={`${signed(x.maintenance.personalOffsetKcal)} kcal/j`} />
        <Kv k="Maintien 80 % / 95 %" v={`${range(x.maintenance.interval80)} / ${range(x.maintenance.interval95)}`} />
        {x.sources ? <Kv k="Poids des sources" v={`théorique ${pct(x.sources.theoreticalWeight)}, historique ${pct(x.sources.historyWeight)}`} /> : null}
        <Kv k="Confiance" v={CONFIDENCE_LABEL[x.maintenance.confidence]} />
        {conf.kind === 'warm_start' ? (
          <Kv
            k="Critère de confiance"
            v={`largeur 80 % ${formatInteger(conf.widthKcal)} kcal/j, soit ${pct(conf.ratio)} de celle du prior (${formatInteger(conf.priorWidthKcal)}) ; « moyenne » exige au plus ${pct(conf.maxRatio)} (${formatInteger(conf.maxRatio * conf.priorWidthKcal)} kcal/j) ${conf.mediumReached ? ': atteint' : ': non atteint'} ; au-delà, il faut tes pesées et la porte de recalibration`}
          />
        ) : conf.kind === 'calibrated' ? (
          <Kv
            k="Critères de confiance"
            v={`porte ${conf.gateMet ? 'franchie' : 'non franchie'} ; largeur 80 % ${formatInteger(conf.widthKcal)} kcal/j (bonne ≤ ${formatInteger(conf.goodMaxWidthKcal)}, élevée ≤ ${formatInteger(conf.highMaxWidthKcal)}) ; durée ${formatInteger(conf.spanDays)} / ${formatInteger(conf.highMinSpanDays)} j ; pesées ${formatInteger(conf.weighInCount)} / ${formatInteger(conf.highMinWeighIns)} ; écarts importants ${pct(conf.majorDeviationFraction)} (élevée < ${pct(conf.highMaxMajorFraction)})`}
          />
        ) : (
          <Kv k="Critère de confiance" v="aucune évidence personnelle : confiance faible jusqu’à la première recalibration" />
        )}
      </Group>

      <Group id="plan" title="F. Plan">
        <Kv k="Vitesse demandée / appliquée" v={`${formatRatePercent(x.goal.requestedWeeklyRate)} / ${formatRatePercent(x.goal.appliedWeeklyRate)}`} />
        <Kv
          k="Vitesse maximale (garde-fou IMC / sélectionnable)"
          v={`${x.goal.guardrailMaxRate === null ? 'sans objet' : formatRatePercent(x.goal.guardrailMaxRate)} / ${x.goal.selectableLimit ? `${x.goal.selectableLimit.maxSelectableRate === null ? 'aucune' : formatRatePercent(x.goal.selectableLimit.maxSelectableRate)}${x.goal.selectableLimit.limitedBy ? ` (${x.goal.selectableLimit.limitedBy})` : ''}` : 'sans objet'}`}
        />
        <Kv k="Rejets" v={x.goal.rejections.length === 0 ? 'aucun' : x.goal.rejections.map((r) => `${formatRatePercent(r.weeklyRate)} ${r.reason}`).join(', ')} />
        {x.solve ? (
          <>
            <Kv k="Cible à 42 j / poids du modèle" v={`${formatNumber(x.solve.targetWeightAtHorizonKg, 2)} / ${formatNumber(x.solve.weightAtHorizonKg, 2)} kg`} />
            <Kv k="Solveur" v={`${x.solve.iterations} itérations, ${x.solve.converged ? 'convergé' : 'non convergé'}, ${kcal(x.solve.calorieTargetKcal)}`} />
          </>
        ) : null}
        <Kv k="Hall : RMR / poids" v={`${formatInteger(x.hall.baselineRmrKcal)} kcal/j / ${formatNumber(x.hall.bodyWeightKg, 1)} kg`} />
        <Kv k="Hall : glucides de base" v={`${formatNumber(x.hall.baselineCarbFraction * 100, 1)} %`} />
        <Kv k="Hall : masse grasse initiale" v={x.hall.initialFatSource} />
        <Kv k="Hall : paramètre d’activité δ" v={`${formatNumber(x.hall.activityParameterKcalPerKgDay, 2)} kcal/kg/j${x.hall.activityParameterClamped ? ' (ramené à 0)' : ''}`} />
        <Kv k="Plancher calorique" v={`${kcal(x.safety.hardFloorKcal)}, marge ${signed(x.safety.floorMarginKcal)} kcal/j`} />
        <Kv k="Faisabilité des macros" v={x.prescription.macroFeasible ? 'OK' : 'infaisable'} />
        <Kv k="Macros exactes (P / G / L)" v={`${formatNumber(x.prescription.macros.proteinG, 1)} / ${formatNumber(x.prescription.macros.carbsG, 1)} / ${formatNumber(x.prescription.macros.fatG, 1)} g`} />
        <Kv k="Règle protéines" v={PROTEIN_RULE_TEXT[x.prescription.proteinRule] ? x.prescription.proteinRule : x.prescription.proteinRule || 'sans objet'} />
        <Kv
          k="Disponibilité énergétique"
          v={
            x.safety.energyAvailability.kcalPerKgFfm === null
              ? 'sans objet (pas de FFM fiable ou charge faible)'
              : `${formatNumber(x.safety.energyAvailability.kcalPerKgFfm, 1)} kcal/kg FFM, seuil ${formatInteger(x.thresholds.energyAvailabilityKcalPerKgFfm)} (marge ${signed(x.safety.energyAvailability.kcalPerKgFfm - x.thresholds.energyAvailabilityKcalPerKgFfm, 1)})`
          }
        />
        <Kv k="Avertissements du plan" v={warnings.join(', ') || 'aucun'} />
        <Kv k="Signaux actifs" v={x.signals.map((s) => SIGNAL_LABEL[s]).join(', ') || 'aucun'} />
        <Kv k="Calories finales (exactes)" v={`${formatNumber(x.prescription.calorieTargetKcal, 1)} kcal/j`} />
        <Kv k="Pas finaux" v={formatInteger(x.prescription.stepTarget)} />
      </Group>
    </div>
  );
}
