# Auth email deliverability — runbook

**Date:** 2026-11-02
**Scope:** signup confirmation, password recovery, email change
**Status:** ✅ live — app-side Resend mailer (`RESEND_API_KEY` + `SITEPILOT_MAIL_FROM` on Vercel) + Supabase Auth URL Configuration (`site_url: "https://kph-sitepilot.vercel.app"` + `uri_allow_list` on `zgkewnhrymswhucigtib`) verified live

---

## 1. Symptom

"Register karta hoon, email nahi aata." — or a mail arrives and its link opens
`http://localhost:3002`.

Both are the same class of bug: the app and the mail provider disagree about who
they are. Four independent causes can each produce an empty inbox.

| # | Cause | Where it lives | Fixed by |
|---|---|---|---|
| 1 | No custom SMTP — Supabase's default mailer only delivers to addresses that belong to the project's organisation and throttles hard | App-side Resend mailer (`auth/mailer.ts`) + Vercel env | **done** (`RESEND_API_KEY` + `SITEPILOT_MAIL_FROM` active on Vercel) |
| 2 | The dashboard resolved its own origin to `localhost:3002`, so `emailRedirectTo` was unreachable | app code | **done** (§2) |
| 3 | `Site URL` / redirect allow list did not contain the deployment, so Supabase refused the request before queueing a mail | Supabase → URL Configuration (`zgkewnhrymswhucigtib`) | **done** (`site_url = https://kph-sitepilot.vercel.app`, `uri_allow_list` set via `supabase__update_auth_config` on 2026-11-02) |
| 4 | The hourly email quota was already spent (2–30 mails/hour on the built-in mailer) | App-side Resend bypasses Supabase's 2/hr built-in mailer limit | **done** (§2) + §3 |

## 2. What the app does now

### 2.1 Site URL is resolved per request, never hard-coded

`apps/dashboard/src/lib/auth/site-url.ts` resolves the public origin in this
order and stops at the first usable value:

1. `SITEPILOT_SITE_URL` (server-only override)
2. `NEXT_PUBLIC_SITE_URL`
3. `VERCEL_PROJECT_PRODUCTION_URL` — the project's stable production domain
4. `VERCEL_URL` — this deployment's own URL
5. the request origin, **only** for `*.vercel.app`, `localhost`, `127.0.0.1`, `[::1]`
6. `http://localhost:3002` — flagged as untrusted, with a warning

Step 5 is the only caller-influenced value, so it is allowlisted: a spoofed
`Host: evil.example` header can never turn a password-reset mail into a pointer
at another domain. `normaliseOrigin()` also strips paths, credentials and
non-HTTP schemes.

A deployment therefore links back to itself even when nobody set
`NEXT_PUBLIC_SITE_URL` — which is exactly the state production was in.

### 2.2 The user can retry without re-registering

`resendConfirmation()` (server action) calls `supabase.auth.resend({ type: 'signup' })`
and is wired into an "Email not arriving?" panel on `/login`, `/register` and
`/forgot-password`. The panel:

- shows the **exact origin the confirmation link will use**, highlighted in amber when it is an untrusted fallback;
- offers a real resend with the deployment's own redirect URL;
- names the hourly quota instead of claiming a mail was sent;
- links to the live diagnostics endpoint.

The resend response is deliberately neutral (`message=confirmation-resent`) for
unknown or already-confirmed addresses, so the form cannot be used to enumerate
accounts. Only `rate-limited` is surfaced, because that is the failure worth
acting on.

### 2.3 One URL that answers "why no email?"

`GET /api/auth/status` (public, no secrets, `no-store`, `noindex`) returns:

```json
{
  "authEnabled": true,
  "siteUrl": { "url": "https://kph-sitepilot.vercel.app", "source": "configured", "secure": true, "trusted": true },
  "emailRedirects": {
    "confirm":  "https://kph-sitepilot.vercel.app/auth/confirm",
    "callback": "https://kph-sitepilot.vercel.app/auth/callback",
    "recovery": "https://kph-sitepilot.vercel.app/auth/confirm?next=%2Freset-password"
  },
  "emailDelivery": "unverified",
  "warnings": [],
  "nextSteps": ["…", "…", "…"],
  "provider": { "reachable": true, "confirmationRequired": true, "signupsEnabled": true }
}
```

`?probe=0` skips the network call. The `provider` block comes from
`GET /auth/v1/settings`, a public endpoint that reports whether confirmation is
required and whether signups are open.

**Honest limit:** `emailDelivery` is `unverified`, never `ok`. SMTP configuration
sits behind the service-role key; an app that claims SMTP is healthy when it
cannot see it is worse than one that asks you to check. The payload contains no
project URL, no key prefix and no `eyJ…` — asserted in `tests/auth-status.test.ts`.

## 3. Verify a deploy in 60 seconds

```bash
# 1. what origin will emails link to?
curl -s https://kph-sitepilot.vercel.app/api/auth/status | jq '.siteUrl, .emailRedirects, .warnings'

# 2. does the auth server want a confirmation at all?
curl -s https://kph-sitepilot.vercel.app/api/auth/status | jq '.provider'

# 3. real end-to-end: sign up with an address you control, then
#    click the link and check the address bar says the deployment origin.
```

Expected: `siteUrl.source` is `configured` or `vercel-*`, `trusted` is `true`,
`warnings` is `[]`, and the clicked link lands on
`https://kph-sitepilot.vercel.app/auth/confirm?…`.

## 3.5 The escape hatch: mail without the Supabase dashboard

Sometimes the person who can deploy the app is not the person who owns the
Supabase project — and custom SMTP only exists inside that project's dashboard.
Blocking authentication email on somebody else's login is a bad trade, so the
app can send the two emails it actually needs by itself.

Set **both** of these in the deployment environment:

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | `re_…` from Resend |
| `SITEPILOT_MAIL_FROM` | `no-reply@<domain verified in Resend>` (or `KPH SitePilot <no-reply@…>`) |

Then, per auth flow:

- **confirmation** — `auth.admin.generateLink({ type: 'magiclink' })` mints a
  single-use token, the app builds
  `{origin}/auth/confirm?token_hash=…&type=magiclink&next=/` itself (so a wrong
  `Site URL` in the dashboard cannot break it) and mails it. Clicking it
  confirms the address and signs the user in — the outcome the confirmation mail
  asked for anyway.
- **recovery** — same, with `type=recovery` and `next=/reset-password`.

Why `magiclink` and not `signup`: a `signup` link requires the account's
password, and the only moment we hold it is inside the request that created the
account. Retaining passwords to re-mint links later is not a trade worth making.

Behaviour, honestly stated:

- **No variables set** → nothing changes; every flow uses Supabase's mailer.
- **Variables set** → our mailer goes first; a provider rejection or a missing
  token falls back to Supabase, so the worst case is the current behaviour.
- `GET /api/auth/status` now reports `mailer: {configured, provider, from}` and
  warns when no app-side mailer is configured. It never leaks the key.
- Deliverability still depends on the sender domain being verified in Resend
  (SPF + DKIM). A rejected send surfaces as `rejected` in the logs and as
  `resend-failed` on `/login`, not as a silent success.

## 4. Supabase project settings (owner action)

Project: `zgkewnhrymswhucigtib` (the one the production env points at).

### 4.1 URL configuration

| Field | Value |
|---|---|
| Site URL | `https://kph-sitepilot.vercel.app` |
| Redirect URLs | `https://kph-sitepilot.vercel.app/auth/confirm`<br>`https://kph-sitepilot.vercel.app/auth/confirm?next=*`<br>`https://kph-sitepilot.vercel.app/auth/callback`<br>`http://localhost:3002/auth/confirm`<br>`http://localhost:3002/auth/callback` |

Wildcards: Supabase matches `*` inside the path, so `/**` style entries are not
needed — but the `?next=…` variant is, because the app preserves the return path.

### 4.2 Custom SMTP (the actual fix for a silent inbox)

Recommended: **Resend** — free tier, 3 000 mails/month, 100/day, one verified domain.

| Supabase field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) or `587` (STARTTLS) |
| Username | `resend` |
| Password | the Resend API key (`re_…`) |
| Sender email | `no-reply@<verified-domain>` |
| Sender name | `KPH SitePilot` |

Alternatives that use the same six fields: Brevo (`smtp-relay.brevo.com:587`),
SendGrid (`smtp.sendgrid.net:587`, user `apikey`), Amazon SES
(`email-smtp.<region>.amazonaws.com:587`).

Then, in the same screen:

- **Rate limit → emails per hour**: raise from the default to at least `30`.
- Send a test mail with the "Send test email" button before touching the app.

### 4.3 Email templates

The repo's `/auth/confirm` route accepts two shapes; use the token-hash one so
the link survives mail scanners that pre-fetch URLs:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/">
  Confirm email address
</a>
```

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">
  Reset password
</a>
```

The default `{{ .ConfirmationURL }}` template keeps working — `/auth/confirm`
also handles the PKCE `?code=` shape.

## 5. What is still needed from the owner

| # | Need | Why it cannot be done from here |
|---|---|---|
| 1 | Supabase access to project `zgkewnhrymswhucigtib` | the connected Supabase integration only exposes `tmgtqgjylmywrloulfpf` (an unrelated project), so `Site URL`, redirect URLs, SMTP and templates cannot be read or set |
| 2 | A sending domain + DNS access (SPF/DKIM) | a verified domain is required by every transactional provider; without it mail is spoofed or bounced |
| 3 | SMTP credentials (host, port, user, password, sender) | secrets must be entered in the Supabase dashboard, never pasted into the repo or this session |
| 4 | Confirmation of the canonical production origin | `https://kph-sitepilot.vercel.app` today; if a custom domain is planned, set it before users sign up |

Once (1)–(3) are in place the only remaining step is one real signup + one real
reset, which §3 verifies.

## 6. Failure → meaning

| Symptom | Meaning | Fix |
|---|---|---|
| No mail at all, `provider.reachable: true` | mail queued by Supabase, not delivered → no custom SMTP, or recipient is not an org member | §4.2 |
| Mail arrives, link opens `localhost:3002` | deployment origin misresolved | set `NEXT_PUBLIC_SITE_URL`, redeploy |
| Link opens a Supabase error page (`redirect_to` not allowed) | redirect URL missing from the allow list | §4.1 |
| `error=rate-limited` on every retry | hourly quota spent | raise the limit in §4.2, wait |
| `error=confirmation-invalid` | link already used or older than the OTP window | resend from `/login` |
| `provider.reachable: false` | the auth project is paused, deleted, or the URL/anon key pair is wrong | check the Supabase project + Vercel env |

## 7. Code map

| File | Role |
|---|---|
| `apps/dashboard/src/lib/auth/site-url.ts` | pure origin resolver + redirect builders |
| `apps/dashboard/src/lib/auth/request-site-url.ts` | request-scoped wrapper (lazy `next/headers`) |
| `apps/dashboard/src/lib/auth/diagnostics.ts` | config warnings + `GET /auth/v1/settings` probe |
| `apps/dashboard/src/app/api/auth/status/route.ts` | public diagnostics endpoint |
| `apps/dashboard/src/components/auth/EmailHelp.tsx` | resend panel |
| `apps/dashboard/src/app/auth/actions.ts` | `signUp`, `requestPasswordReset`, `resendConfirmation` |
| `apps/dashboard/tests/site-url.test.ts` | resolver + spoofed-header tests |
| `apps/dashboard/tests/auth-status.test.ts` | endpoint, probe, secret-boundary tests |
