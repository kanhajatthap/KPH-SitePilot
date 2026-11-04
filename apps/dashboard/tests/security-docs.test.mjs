import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
const root = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const review = read('docs/security-review.md');
const faq = read('apps/dashboard/src/app/docs/faq/page.tsx');
const safety = read('apps/dashboard/src/app/docs/safety/page.tsx');

describe('E11-08 security evidence and public docs', () => {
  it('points to existing evidence paths', () => {
    const paths = [...review.matchAll(/`((?:apps|packages|supabase|scripts|docs)\/[^`]+)`/g)];
    expect(paths.length).toBeGreaterThan(15);
    for (const [, p] of paths) expect(fs.existsSync(path.join(root, p)), p).toBe(true);
  });
  it('keeps code findings open rather than claiming certification', () => {
    expect(review).not.toContain('COMPLETED & VERIFIED');
    for (const text of ['sandboxed srcDoc', 'budget now runs after signature/site matching', 'Retry-After: 30', 'raw caught error messages', 'without failing the job']) {
      expect(review).toContain(text);
    }
    expect(review).toContain('not fixed by this');
  });
  it('does not promise every undo or a deployment-specific mailer', () => {
    expect(faq).not.toContain('Yes, for every shipped write tool');
    expect(faq).toContain('queued is not restored');
    expect(faq).toContain('app-side Resend or the Supabase mailer');
    expect(faq).toContain('matching main pushes or manual dispatch');
  });
  it('separates unusable undo from the original write and prohibits code injection', () => {
    expect(safety).toContain('does not prove the original write never happened');
    expect(safety).toContain('Queued is not restored');
    expect(safety).toContain('prohibited, not roadmap features');
  });
});
