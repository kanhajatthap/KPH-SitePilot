import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { RestrictedFilePathSchema, validateRestrictedFileReview, restrictedFileExecutionGate } from '../src/restricted-editor.js';

const siteId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const proposalId = 'a'.repeat(32);
const beforeHash = 'b'.repeat(64); const afterHash = 'c'.repeat(64);
const request = { siteId, proposalId, confirmation: proposalId, beforeHash, afterHash };
const saved = { siteId, ownerId, proposalId, beforeHash, afterHash, path: 'themes/test-child/style.css', risk: 'R3', createdAt: 1000, expiresAt: 601000, status: 'pending' };
const context = { actorId: ownerId, siteId, ownerId, environment: 'staging', operatorOptIn: true, connectorProtocol: 'restricted-files-v1', allowedPaths: [saved.path], currentHash: beforeHash, now: 2000 };

describe('experimental restricted editor review contract', () => {
  it('allows only review, never execution', () => {
    expect(validateRestrictedFileReview(request, saved, context)).toEqual({ ok: true, reviewOnly: true, risk: 'R3' });
    expect(restrictedFileExecutionGate()).toEqual({ allowed: false, code: 'FILE_EDITOR_NOT_RELEASED' });
  });
  it.each(['production', 'local', 'development'])('refuses %s', (environment) => {
    expect(validateRestrictedFileReview(request, saved, { ...context, environment })).toEqual({ ok: false, code: 'STAGING_REQUIRED' });
  });
  it.each([
    { actorId: otherId }, { ownerId: otherId }, { siteId: otherId }, { operatorOptIn: false },
  ])('refuses authority mismatch %j', (change) => {
    expect(validateRestrictedFileReview(request, saved, { ...context, ...change })).toEqual({ ok: false, code: 'FORBIDDEN' });
  });
  it.each([{ ownerId: otherId }, { siteId: otherId }])('binds stored ownership %j', (change) => {
    expect(validateRestrictedFileReview(request, { ...saved, ...change }, context)).toEqual({ ok: false, code: 'FORBIDDEN' });
  });
  it.each([{ confirmation: 'd'.repeat(32) }, { proposalId: 'd'.repeat(32) }, { beforeHash: afterHash }, { afterHash: beforeHash }])('binds approval %j', (change) => {
    expect(validateRestrictedFileReview({ ...request, ...change }, saved, context)).toEqual({ ok: false, code: 'APPROVAL_MISMATCH' });
  });
  it.each([{ status: 'consumed' }, { status: 'revoked' }, { createdAt: 3000 }, { expiresAt: 2000 }])('refuses unusable proposal %j', (change) => {
    expect(validateRestrictedFileReview(request, { ...saved, ...change }, context)).toEqual({ ok: false, code: 'PROPOSAL_UNAVAILABLE' });
  });
  it('checks exact paths and current hash', () => {
    expect(validateRestrictedFileReview(request, saved, { ...context, allowedPaths: [] })).toEqual({ ok: false, code: 'NOT_ALLOWLISTED' });
    expect(validateRestrictedFileReview(request, saved, { ...context, currentHash: afterHash })).toEqual({ ok: false, code: 'FILE_CHANGED' });
  });
  it.each([null, {}, { ...request, source: '<?php return 1;' }, { ...request, risk: 'R0' }, { ...request, confirmation: 'CONFIRM' }, { ...request, beforeHash: beforeHash + '\n' }, { ...request, proposalId: proposalId + '\n' }])('rejects malformed or injected requests %j', (input) => {
    expect(validateRestrictedFileReview(input, saved, context)).toEqual({ ok: false, code: 'INVALID_CONTRACT' });
  });
  it('rejects missing attestation version, excess TTL and downgraded risk', () => {
    expect(validateRestrictedFileReview(request, saved, { ...context, connectorProtocol: '1.0.0' }).ok).toBe(false);
    expect(validateRestrictedFileReview(request, { ...saved, expiresAt: 601001 }, context).ok).toBe(false);
    expect(validateRestrictedFileReview(request, { ...saved, risk: 'R0' }, context).ok).toBe(false);
  });
  it.each(['../wp-config.php', 'themes/test/config.php', 'plugins/vendor/main.js', 'plugins/kph-sitepilot-connector/main.php', 'themes/test/a.css\n', 'themes/test/a.css%00', 'themes/test/.env', 'themes/test/a.sql'])('blocks path %s', (path) => {
    expect(RestrictedFilePathSchema.safeParse(path).success).toBe(false);
  });
  it.each(['themes/test/style.css', 'plugins/test/src/main.js', 'themes/test/functions.php'])('accepts selected source shape %s', (path) => {
    expect(RestrictedFilePathSchema.safeParse(path).success).toBe(true);
  });
  it('does not export the experiment from the shipped contracts entrypoint', () => {
    expect(readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')).not.toContain('restricted-editor');
  });
});
