'use client';
import { useEffect, useState } from 'react';
import { SourceDiff } from '../../components/restricted-review/source-diff';

type Review = { siteId: string; proposalId: string; path: string; before: string; after: string; beforeHash: string; afterHash: string; validUntil: string; expiresAt: string };
export default function RestrictedReviewPage() {
  const [review, setReview] = useState<Review | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('Loading review…');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const abort = new AbortController();
    const params = new URLSearchParams(window.location.search);
    const q = new URLSearchParams({ siteId: params.get('siteId') ?? '', proposalId: params.get('proposalId') ?? '' });
    fetch(`/api/connector/restricted-files/proposal?${q}`, { cache: 'no-store', signal: abort.signal }).then(async r => {
      if (!r.ok) throw new Error('Review unavailable. Sign in as the site owner and request a fresh connector proposal.');
      setReview(await r.json()); setMessage('Review only. No file changes will be dispatched.');
    }).catch(e => { if (!abort.signal.aborted) setMessage(e.message); });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => { abort.abort(); clearInterval(timer); };
  }, []);
  const expired = !review || !Number.isFinite(Date.parse(review.validUntil)) || !Number.isFinite(Date.parse(review.expiresAt)) || Date.parse(review.validUntil) <= now || Date.parse(review.expiresAt) <= now;
  async function approve() {
    if (!review || expired || busy || done || confirmation !== review.proposalId) return;
    setBusy(true);
    try {
      const response = await fetch('/api/connector/restricted-files/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ siteId: review.siteId, proposalId: review.proposalId, beforeHash: review.beforeHash, afterHash: review.afterHash, confirmation }) });
      const result = await response.json();
      if (!response.ok || result.executionAllowed !== false || result.status !== 'review_recorded') throw new Error('Review not confirmed. It may be expired, already used, or no longer authorised. Reload before retrying.');
      setDone(true); setMessage('Review recorded. No file was changed. Execution remains disabled.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Review unavailable.'); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 1100, margin: '40px auto', padding: 24 }}>
    <h1>Restricted source review</h1>
    <p><strong>Experimental · R3 · staging only</strong></p>
    <p>PHP and JavaScript can execute code when loaded. Syntax checks cannot guarantee safety. This screen records a single-use review, not permission to execute.</p>
    <p role="status">{message}</p>
    {review && <>
      <h2>{review.path}</h2>
      <p>Fresh evidence valid until: {review.validUntil}</p>
      <p>Proposal expires: {review.expiresAt}</p>
      <p style={{ overflowWrap: 'anywhere' }}>Before SHA-256: {review.beforeHash}<br />After SHA-256: {review.afterHash}</p>
      <p>Highlighted lines differ at the same line number; inserted lines may shift subsequent comparisons.</p>
      <SourceDiff before={review.before} after={review.after} />
      <label htmlFor="proposal-confirmation">Type proposal ID: <code>{review.proposalId}</code></label>
      <input id="proposal-confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} disabled={done || busy || expired} style={{ display: 'block', width: '100%', padding: 12, margin: '12px 0' }} />
      {expired && <p>Evidence expired. Request a fresh proposal from the connector.</p>}
      <button onClick={approve} disabled={done || busy || expired || confirmation !== review.proposalId}>{busy ? 'Recording…' : done ? 'Review recorded' : 'Record review — no execution'}</button>
    </>}
  </main>;
}
