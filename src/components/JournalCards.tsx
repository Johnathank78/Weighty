import { useNav } from '@/app/navigation';
import { ShortNotice } from '@/components/ShortNotice';
import { acceptMeasuredOffer, declineAlignProposal, declineMeasuredOffer, measuredOfferView, openAlignProposal, switchToAlignedTarget } from '@/domain/journalPath';
import { JOURNAL_MESSAGE, SHORT_MESSAGE } from '@/domain/planMessages';
import type { AlignedTarget } from '@/domain/types';
import { useWheighty } from '@/store/StoreProvider';

/**
 * Journal path cards (pass 5b), at the top of the message zone: the automatic proposal to align the target, and a plan of
 * the measured habit awaiting confirmation. Each card has its two buttons; nothing changes until the user answers.
 */
export function JournalCards() {
  const { store, today } = useWheighty();
  const proposal = openAlignProposal(store, today);
  const offer = measuredOfferView(store);
  if (!proposal && !offer) return null;
  return (
    <>
      {proposal ? <AlignProposalCard target={proposal.target} onDeclined={null} /> : null}
      {offer ? <MeasuredOfferCard /> : null}
    </>
  );
}

/**
 * The proposal to aim at the aligned target (automatic, or asked from the Plan tab). `onDeclined`: the Plan tab closes its
 * card; the automatic proposal records the refusal (it may come back a week later).
 */
export function AlignProposalCard({ target, onDeclined }: { target: AlignedTarget; onDeclined: (() => void) | null }) {
  const { showToast } = useNav();
  const { update, today, nowIso } = useWheighty();
  const kcal = target.finalKcal;
  const accept = () => {
    const at = nowIso();
    update((s) => {
      const r = switchToAlignedTarget(s, today, at);
      return r.ok ? r.store : s;
    });
    showToast(JOURNAL_MESSAGE.switchedToast);
  };
  const decline = () => {
    if (onDeclined) onDeclined();
    else {
      const at = nowIso();
      update((s) => declineAlignProposal(s, today, at));
    }
  };
  const short = SHORT_MESSAGE.proposal(kcal);
  // Pass 5b fixes, point 5: short format; the long texts of pass 5b behind "Détails".
  const detail = target.raised ? `${JOURNAL_MESSAGE.proposalText(kcal)} ${JOURNAL_MESSAGE.floorRaised(target.medianKcal, kcal)}` : JOURNAL_MESSAGE.proposalText(kcal);
  return (
    <ShortNotice title={short.title} line={short.line} detail={detail}>
      {target.raised ? <span className="small">{SHORT_MESSAGE.floorRaisedLine(kcal)}</span> : null}
      <button type="button" className="btn btn--primary btn--small" onClick={accept}>
        {JOURNAL_MESSAGE.proposalAccept(kcal)}
      </button>
      <button type="button" className="btn btn--ghost btn--small" onClick={decline}>
        {JOURNAL_MESSAGE.proposalDecline}
      </button>
    </ShortNotice>
  );
}

/** A plan of the measured habit awaiting confirmation ("Utiliser ce plan" / "Plus tard"). */
function MeasuredOfferCard() {
  const { showToast } = useNav();
  const { store, update, today, nowIso } = useWheighty();
  const offer = measuredOfferView(store);
  if (!offer) return null;
  const accept = () => {
    const at = nowIso();
    update((s) => {
      const r = acceptMeasuredOffer(s, today, at);
      return r.ok ? r.store : s;
    });
    showToast(JOURNAL_MESSAGE.offerAcceptedToast);
  };
  const decline = () => {
    const at = nowIso();
    update((s) => declineMeasuredOffer(s, today, at));
  };
  return (
    <ShortNotice title={offer.short.title} line={offer.short.line} detail={offer.text} mascot="surpris">
      <button type="button" className="btn btn--primary btn--small" onClick={accept}>
        {offer.accept}
      </button>
      <button type="button" className="btn btn--ghost btn--small" onClick={decline}>
        {offer.decline}
      </button>
    </ShortNotice>
  );
}
