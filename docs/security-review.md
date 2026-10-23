# KPH SitePilot — Comprehensive Security Review & Audit

**Date:** 2026-10-22  
**Status:** COMPLETED & VERIFIED  
**Frameworks:** OWASP Top 10 for LLMs (2025), CWE Top 25, WordPress Defensive Coding Standards

---

## 1. OWASP Top 10 for LLM Applications Matrix

| Vulnerability ID | Vulnerability Name | Mitigation in KPH SitePilot | Verification Status |
|---|---|---|---|
| **LLM01** | **Prompt Injection** | Prompt delimiters isolate system instructions from user prompts. WordPress page contents and external data are parsed as untrusted strings, never as instructions. Zod schema validation strips non-conforming instructions. | Verified in `tests/agent-core.test.ts` & `tests/page-read.test.ts` |
| **LLM02** | **Insecure Output Handling** | Model outputs are parsed into strict Zod ASTs (`SitePlanSchema`, `ChangePlanSchema`). Dashboard renders using typed React components with automatic text escaping; `dangerouslySetInnerHTML` is prohibited. | Verified in `apps/dashboard/tests/` |
| **LLM03** | **Training Data Poisoning** | KPH SitePilot operates strictly via runtime inference against authorized foundational models (Gemini); no continuous fine-tuning is performed on untrusted corpus. | N/A (Runtime Inference) |
| **LLM04** | **Model Denial of Service** | Strict 64 KB request body limits (`readJsonBody`), max token caps (8192 tokens), and sliding-window rate limiters prevent resource exhaustion. | Verified in `apps/api/src/index.ts` & `packages/supabase/tests/agent-proxy.test.ts` |
| **LLM05** | **Supply Chain Vulnerabilities** | Monorepo uses `pnpm` with frozen lockfile validation (`--frozen-lockfile`) and supply-chain auditing. Zero untrusted CDN scripts. | Verified via `pnpm audit` |
| **LLM06** | **Sensitive Information Disclosure** | WordPress credentials and Gemini API keys are server-side only. Logs pass through `@wp-agent/audit` with automated regex redaction. Credentials in database are encrypted with AES-256-GCM. | Verified in `packages/audit/tests/` & `packages/supabase/tests/vault.test.ts` |
| **LLM07** | **Insecure Plugin Design** | Tool execution is **deny-by-default**. Tool invocations are strictly schema-validated; unknown tools, arbitrary shell commands, and arbitrary PHP code evaluation are rejected with `UNKNOWN_TOOL` / `FORBIDDEN`. | Verified in `packages/agent-core/tests/` |
| **LLM08** | **Excessive Agency** | All write operations are staged into a `ChangePlan`. Direct mutations are forbidden without explicit human approval and cryptographic hash locking (`calculatePlanHash`). | Verified in `packages/agent-core/tests/mutation-controller.test.ts` |
| **LLM09** | **Overreliance** | Staged change plans display human-readable before/after visual diffs and dry-run impact estimates prior to execution. | Verified in Phase 5 controller & UI |
| **LLM10** | **Model Theft** | API keys and adapter tokens reside behind server-side reverse proxy and Supabase Edge Functions; never exposed to browser context. | Verified in `apps/dashboard/tests/api-routes.test.ts` |

---

## 2. Server-Side Request Forgery (SSRF) Mitigations

KPH SitePilot interacts with WordPress REST endpoints. To prevent SSRF attacks targeting cloud metadata services or internal corporate networks:

1. **Target Allowlist Enforcement**:
   - Only URLs explicitly configured in `allowedTargets` or ending with `.local`, `localhost`, or `127.0.0.1` are accepted.
   - Cloud metadata IP addresses (`169.254.169.254`, `metadata.google.internal`) are blocked at URL resolution.
2. **Protocol Restrictions**:
   - Only `http:` and `https:` protocols are accepted; `file:`, `gopher:`, `ftp:` are rejected by Zod `.url()` and URL parsing.
3. **TLS Validation**:
   - TLS certificate validation cannot be disabled; `--insecure` and `NODE_TLS_REJECT_UNAUTHORIZED=0` are strictly disallowed.

---

## 3. Cryptographic Storage & Secrets Hygiene

1. **AES-256-GCM Encryption**:
   - WordPress Application Passwords are encrypted before persisting to PostgreSQL using AES-256-GCM with a 96-bit unique IV and 128-bit authentication tag.
   - Tampered payloads fail decryption immediately with `AgentError(ErrorCode.UNAUTHORIZED)`.
2. **Post-Approval Integrity Locking**:
   - When a user approves a staged change plan, a SHA-256 hash of the entire plan (author, operations, resources, parameters) is computed.
   - If any operation is altered in transit or before application, the controller rejects execution with `FORBIDDEN`.
3. **Secret Redaction in Audit Logging**:
   - `@wp-agent/audit` automatically sanitizes bearer tokens, API keys, basic auth headers, and passwords prior to writing log records.

---

## 4. Multi-Tenant Cross-Contamination Defense (RLS)

- **PostgreSQL Row Level Security**: Declared on `profiles`, `projects`, `wordpress_connections`, `change_proposals`, and `audit_events`.
- **Immutability of Audit Records**: Tenants are prohibited from updating or deleting records in `audit_events`.
- **Cross-Tenant Leakage**: All queries enforce `auth.uid() = owner_id` or join through project ownership chains.
