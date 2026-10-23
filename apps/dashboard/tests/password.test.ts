import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATED_LENGTH, MIN_GENERATED_LENGTH, generatePassword } from '../src/lib/auth/password';

describe('generatePassword', () => {
  it('produces a password of the requested length', () => {
    expect(generatePassword()).toHaveLength(DEFAULT_GENERATED_LENGTH);
    expect(generatePassword(24)).toHaveLength(24);
  });

  it('never generates fewer than the minimum length', () => {
    expect(generatePassword(4)).toHaveLength(MIN_GENERATED_LENGTH);
  });

  it('always includes upper, lower, digit and symbol characters', () => {
    for (let index = 0; index < 50; index += 1) {
      const password = generatePassword();
      expect(password, password).toMatch(/[A-Z]/);
      expect(password, password).toMatch(/[a-z]/);
      expect(password, password).toMatch(/[0-9]/);
      expect(password, password).toMatch(/[!@#$%^&*()\-_=+?]/);
    }
  });

  it('does not repeat across generated values', () => {
    const values = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(values.size).toBe(200);
  });

  it('satisfies the signup password policy', () => {
    const password = generatePassword();
    expect(password.length).toBeGreaterThanOrEqual(12);
    expect(password.length).toBeLessThanOrEqual(128);
  });
});
