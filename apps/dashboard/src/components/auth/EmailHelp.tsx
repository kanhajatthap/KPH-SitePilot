import { resendConfirmation } from '../../app/auth/actions';
import { SubmitButton } from './SubmitButton';

interface EmailHelpProps {
  /** Safe post-confirmation path preserved through the resend flow. */
  next?: string;
  /** Origin the confirmation link will point at, as resolved on the server. */
  confirmUrl: string;
  /** True when the origin came from configuration or the platform. */
  trusted: boolean;
  /** True when the deployment sends auth mail itself (Resend), not via Supabase SMTP. */
  mailerConfigured?: boolean;
  defaultEmail?: string;
}

/**
 * "Email not arriving?" panel.
 *
 * Sits under the sign-in form because that is where people land when their
 * confirmation mail never showed up. It states the link origin it will use
 * (`https://…`, not `http://localhost:3002`) so a misconfigured deployment is
 * visible instead of mysterious, offers a real resend, and links to the live
 * diagnostics endpoint.
 */
export function EmailHelp({ next = '/', confirmUrl, trusted, mailerConfigured = false, defaultEmail }: EmailHelpProps) {
  return (
    <details className="mt-5 rounded-xl border border-line bg-white/70 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-soft">
      <summary className="cursor-pointer font-medium text-ink">Email not arriving?</summary>

      <ol className="mt-2.5 list-decimal space-y-1 pl-4 text-ink-muted">
        <li>Wait a minute and check the spam or promotions folder.</li>
        {mailerConfigured ? (
          <>
            <li>This deployment sends its own mail through Resend — the sender domain must be verified (SPF + DKIM).</li>
            <li>If you are the deployment owner, check Resend Emails/Logs for a rejected or bounced send.</li>
          </>
        ) : (
          <>
            <li>Supabase allows only a few auth emails per hour — extra attempts are dropped.</li>
            <li>Ask the deployment owner whether custom SMTP is configured; the built-in mailer only reaches project members.</li>
          </>
        )}
      </ol>

      <p className="mt-2.5 text-ink-muted">
        The confirmation link will point at{' '}
        <code className={`rounded px-1 py-0.5 ${trusted ? 'bg-slate-100' : 'bg-amber-100 text-amber-900'}`}>
          {confirmUrl}
        </code>
        {trusted ? null : ' — that origin is a fallback, so the link will not open for anyone else.'}
      </p>

      <form action={resendConfirmation} className="mt-3 space-y-2">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="resend-email" className="block text-[12px] font-medium text-ink-soft">
          Resend the confirmation link
        </label>
        <input
          id="resend-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          aria-required="true"
          defaultValue={defaultEmail}
          placeholder="you@example.com"
          className="w-full rounded-xl border border-line-strong bg-white px-3 py-2 text-[12.5px] text-ink placeholder:text-ink-muted transition focus:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-500/20"
        />
        <SubmitButton pendingLabel="Sending…">Resend confirmation email</SubmitButton>
      </form>

      <p className="mt-3 text-[11.5px] text-ink-muted">
        Still nothing? Open{' '}
        <a href="/api/auth/status" className="font-medium text-pink-600 underline underline-offset-4">
          /api/auth/status
        </a>{' '}
        to see what this deployment is actually sending.
      </p>
    </details>
  );
}
