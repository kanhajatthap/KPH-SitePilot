/**
 * Reversible-write policy & snapshot-to-undo job resolver (E3-09 / E6-01).
 *
 * Every connector mutation stores a before-snapshot. This module decides
 * whether a stored snapshot can be reversed safely, and which allowlisted
 * restore tool (`content.restore` or `settings.restore`) performs the undo.
 *
 * `siteurl` and `home` are deliberately excluded from `WRITABLE_SETTINGS_KEYS`
 * even though `settings.get` can read them: a prompt must never be able to
 * rewrite a site's canonical origin and lock out its own connector.
 */

export const WRITABLE_SETTINGS_KEYS = [
  'blogname',
  'blogdescription',
  'timezone_string',
  'date_format',
  'time_format',
  'posts_per_page',
  'default_comment_status',
  'default_ping_status',
] as const;

export type WritableSettingKey = (typeof WRITABLE_SETTINGS_KEYS)[number];

const OPEN_CLOSED = new Set(['open', 'closed']);

/**
 * Validates a partial map of WordPress options against the writable allowlist.
 * Returns null if any unknown key is present, any value is out of range, or
 * the map is empty.
 */
export function sanitizeSettingsValues(
  raw: unknown
): Record<WritableSettingKey, string | number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0 || entries.length > WRITABLE_SETTINGS_KEYS.length) return null;

  const cleaned: Partial<Record<WritableSettingKey, string | number>> = {};

  for (const [key, value] of entries) {
    if (!(WRITABLE_SETTINGS_KEYS as readonly string[]).includes(key)) {
      return null;
    }
    const typedKey = key as WritableSettingKey;

    switch (typedKey) {
      case 'blogname': {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (trimmed.length < 1 || trimmed.length > 200) return null;
        cleaned[typedKey] = trimmed;
        break;
      }

      case 'blogdescription': {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (trimmed.length > 400) return null;
        cleaned[typedKey] = trimmed;
        break;
      }

      case 'timezone_string': {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (trimmed.length > 64 || (trimmed.length > 0 && !/^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(trimmed))) {
          return null;
        }
        cleaned[typedKey] = trimmed;
        break;
      }

      case 'date_format':
      case 'time_format': {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        if (trimmed.length < 1 || trimmed.length > 64) return null;
        cleaned[typedKey] = trimmed;
        break;
      }

      case 'posts_per_page': {
        const num = typeof value === 'string' ? Number(value) : value;
        if (typeof num !== 'number' || !Number.isInteger(num) || num < 1 || num > 100) {
          return null;
        }
        cleaned[typedKey] = num;
        break;
      }

      case 'default_comment_status':
      case 'default_ping_status': {
        if (typeof value !== 'string') return null;
        const status = value.trim().toLowerCase();
        if (!OPEN_CLOSED.has(status)) return null;
        cleaned[typedKey] = status;
        break;
      }
    }
  }

  return Object.keys(cleaned).length > 0
    ? (cleaned as Record<WritableSettingKey, string | number>)
    : null;
}

export type UndoResolution =
  | {
      ok: true;
      tool: 'content.restore' | 'settings.restore';
      args: Record<string, unknown>;
      risk: 'R1';
    }
  | {
      ok: false;
      code: 'SNAPSHOT_UNUSABLE' | 'ROLLBACK_UNAVAILABLE';
      message: string;
    };

export function resolveUndoJob(snapshot: {
  resource: string;
  before: Record<string, unknown> | null;
}): UndoResolution {
  const resource = (snapshot.resource ?? '').trim();
  const before = snapshot.before ?? null;

  if (!before || typeof before !== 'object' || Array.isArray(before)) {
    return {
      ok: false,
      code: 'SNAPSHOT_UNUSABLE',
      message: 'This snapshot does not carry restorable fields.',
    };
  }

  if (resource === 'settings' || resource.startsWith('settings:')) {
    const candidate = 'values' in before ? (before as { values?: unknown }).values : before;
    const values = sanitizeSettingsValues(candidate);
    if (!values) {
      return {
        ok: false,
        code: 'SNAPSHOT_UNUSABLE',
        message: 'Settings snapshot contains missing or non-restorable option keys.',
      };
    }

    return {
      ok: true,
      tool: 'settings.restore',
      args: { before: { values } },
      risk: 'R1',
    };
  }

  if ('id' in before) {
    const rawId = (before as { id?: unknown }).id;
    const id = typeof rawId === 'string' ? Number(rawId) : rawId;
    if (typeof id === 'number' && Number.isInteger(id) && id > 0) {
      return {
        ok: true,
        tool: 'content.restore',
        args: { before },
        risk: 'R1',
      };
    }
  }

  if (resource.startsWith('irreversible:')) {
    return {
      ok: false,
      code: 'ROLLBACK_UNAVAILABLE',
      message: 'This operation cannot be undone automatically.',
    };
  }

  return {
    ok: false,
    code: 'SNAPSHOT_UNUSABLE',
    message: 'This snapshot does not carry restorable fields.',
  };
}
