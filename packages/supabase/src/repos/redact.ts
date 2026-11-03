/**
 * Audit payload redaction (E1-05). Audit rows are readable by the owner, so a
 * payload must never carry a key, token, cookie or credential — including one
 * that arrived nested inside site/plugin data.
 */

const SENSITIVE_KEY = /(token|secret|password|passwd|api[_-]?key|authorization|cookie|credential|salt|private[_-]?key|bearer)/i;
const SENSITIVE_VALUE = /(Bearer\s+\S+|sk-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/i;
const REDACTED = '[redacted]';
const MAX_STRING = 256;
const MAX_DEPTH = 6;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

export function redactPayload(
  payload: Record<string, unknown>,
  depth = 0
): Record<string, unknown> {
  if (depth > MAX_DEPTH) return { [REDACTED]: 'max depth' };
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
      continue;
    }
    result[key] = redactValue(value, depth + 1);
  }
  return result;
}

function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') {
    if (SENSITIVE_VALUE.test(value)) return REDACTED;
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  }
  if (Array.isArray(value)) {
    if (depth > MAX_DEPTH) return REDACTED;
    return value.slice(0, 100).map((item) =>
      item !== null && typeof item === 'object'
        ? redactValue(item, depth + 1)
        : typeof item === 'string' && SENSITIVE_VALUE.test(item)
          ? REDACTED
          : item
    );
  }
  if (value !== null && typeof value === 'object') {
    if (depth > MAX_DEPTH) return REDACTED;
    return redactPayload(value as Record<string, unknown>, depth);
  }
  return value;
}
