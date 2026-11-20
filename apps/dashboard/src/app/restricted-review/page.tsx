'use client';
import { useEffect, useRef, useState } from 'react';
import { SourceDiff } from '../../components/restricted-review/source-diff';

import { ReviewSourceSchema, ReceiptStatusSchema, readFailureMessage, UNCERTAIN_RECEIPT, type ReviewSource as Review } from '../../lib/restricted-review-client';

export default function RestrictedReviewPage() {
  const [review, setReview] = useState<Review | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('Loading review…');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submitting = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const q = new URLSearchParams({ siteId: params.get('siteId') ?? '', proposalId: params.get('proposalId') ?? '' });
    setReview(null); setConfirmation(''); setMessage('Loading review…');
    const timeout = setTimeout(() => { abort.abort(); setMessage('Review service timed out. Reload status to retry safely.'); }, 15000);
    (async () => {
      if (reload > 0) {
        const statusResponse = await fetch(`/api/connector/restricted-files/status?${q}`, { cache: 'no-store', signal: abort.signal });
        if (!statusResponse.ok) throw new Error(readFailureMessage(statusResponse.status));
        const parsedStatus = ReceiptStatusSchema.safeParse(await statusResponse.json());
        if (!parsedStatus.success) throw new Error('Invalid review status. Reload later or request a fresh proposal.');
        const status = parsedStatus.data;
        if (status.siteId !== q.get('siteId') || status.proposalId !== q.get('proposalId')) throw new Error('Review identity mismatch.');
        if (abort.signal.aborted) return;
        if (status.status !== 'pending' || status.expired) {
          setDone(true); setMessage(status.status === 'consumed' ? 'Review already recorded. No file was changed. Execution remains disabled.' : 'Review revoked or expired. Request a fresh proposal.'); return;
        }
      }
      const response = await fetch(`/api/connector/restricted-files/proposal?${q}`, { cache: 'no-store', signal: abort.signal });
      if (!response.ok) throw new Error(readFailureMessage(response.status));
      const parsed = ReviewSourceSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.siteId !== q.get('siteId') || parsed.data.proposalId !== q.get('proposalId')) throw new Error('Invalid review response. Source has been cleared.');
      if (abort.signal.aborted) return;
      setReview(parsed.data); setUncertain(false); setMessage('Review only. No file changes will be dispatched.');
    })().catch(e => { if (!abort.signal.aborted) setMessage(e instanceof Error ? e.message : readFailureMessage(503)); })
      .finally(() => clearTimeout(timeout));
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { abort.abort(); clearTimeout(timeout); clearInterval(timer); };
  }, [reload]);
  const expired = !review || !Number.isFinite(Date.parse(review.validUntil)) || !Number.isFinite(Date.parse(review.expiresAt)) || Date.parse(review.validUntil) <= now || Date.parse(review.expiresAt) <= now;
  async function approve() {
    if (!review || Date.parse(review.validUntil) <= Date.now() || Date.parse(review.expiresAt) <= Date.now() || expired || busy || done || uncertain || submitting.current || confirmation !== review.proposalId) return;
    submitting.current = true; setBusy(true);
    const abort = new AbortController(); const timeout = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch('/api/connector/restricted-files/review', { method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: review.siteId, proposalId: review.proposalId, beforeHash: review.beforeHash, afterHash: review.afterHash, confirmation }) });
      const result = await response.json();
      if (!response.ok || result.executionAllowed !== false || result.status !== 'review_recorded') throw new Error('Review not confirmed. It may be expired, already used, or no longer authorised. Reload before retrying.');
      setDone(true); setMessage('Review recorded. No file was changed. Execution remains disabled.');
    } catch { setUncertain(true); setReview(null); setConfirmation(''); setMessage(UNCERTAIN_RECEIPT); }
    finally { clearTimeout(timeout); submitting.current = false; setBusy(false); }
  }
  return <main style={{ maxWidth: 1100, margin: '40px auto', padding: 24 }}>
    <h1>Restricted source review</h1>
    <p><strong>Experimental · R3 · staging only</strong></p>
    <p>PHP and JavaScript can execute code when loaded. Syntax checks cannot guarantee safety. This screen records a single-use review, not permission to execute.</p>
    <p role="status">{message}</p>
    <button disabled={busy || done} onClick={() => setReload(n => n + 1)}>Reload status</button>
    {review && <>
      <h2>{review.path}</h2>
      <p>Fresh evidence valid until: {review.validUntil}</p>
      <p>Proposal expires: {review.expiresAt}</p>
      <p style={{ overflowWrap: 'anywhere' }}>Before SHA-256: {review.beforeHash}<br />After SHA-256: {review.afterHash}</p>
      <p>Highlighted lines differ at the same line number; inserted lines may shift subsequent comparisons.</p>
      {!expired && <SourceDiff before={review.before} after={review.after} />}
      <label htmlFor="proposal-confirmation">Type proposal ID: <code>{review.proposalId}</code></label>
      <input id="proposal-confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} disabled={done || busy || expired} style={{ display: 'block', width: '100%', padding: 12, margin: '12px 0' }} />
      {expired && <p>Evidence expired. Request a fresh proposal from the connector.</p>}
      <button onClick={approve} disabled={done || busy || expired || confirmation !== review.proposalId}>{busy ? 'Recording…' : done ? 'Review recorded' : 'Record review — no execution'}</button>
    </>}
  </main>;
}
