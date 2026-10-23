const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*()-_=+?';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

export const MIN_GENERATED_LENGTH = 16;
export const DEFAULT_GENERATED_LENGTH = 20;

function randomIndex(max: number): number {
  // Rejection sampling avoids modulo bias.
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buffer = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buffer);
    value = buffer[0];
  } while (value >= limit);
  return value % max;
}

function pick(characters: string): string {
  return characters[randomIndex(characters.length)];
}

/**
 * Generates a cryptographically random password that always contains at least
 * one uppercase, lowercase, digit and symbol. Uses the Web Crypto API, so it
 * works in the browser and in Node 19+ without dependencies.
 */
export function generatePassword(length: number = DEFAULT_GENERATED_LENGTH): string {
  const size = Math.max(MIN_GENERATED_LENGTH, Math.floor(length));
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const characters = [
    ...required,
    ...Array.from({ length: size - required.length }, () => pick(ALL)),
  ];

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapWith = randomIndex(index + 1);
    [characters[index], characters[swapWith]] = [characters[swapWith], characters[index]];
  }

  return characters.join('');
}
