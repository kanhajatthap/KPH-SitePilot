/**
 * Reversible-write policy & snapshot-to-undo job resolver (E3-09 / E6-01 / E7-02 / E5-10 / E5-13).
 *
 * Every connector mutation stores a before-snapshot. This module decides
 * whether a stored snapshot can be reversed safely, and which allowlisted
 * restore tool performs the undo.
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

export const ALLOWED_SEO_META_KEYS = new Set([
  // Yoast SEO
  '_yoast_wpseo_title',
  '_yoast_wpseo_metadesc',
  '_yoast_wpseo_canonical',
  '_yoast_wpseo_opengraph-title',
  '_yoast_wpseo_opengraph-description',
  '_yoast_wpseo_meta-robots-noindex',
  // Rank Math
  'rank_math_title',
  'rank_math_description',
  'rank_math_canonical_url',
  'rank_math_facebook_title',
  'rank_math_facebook_description',
  'rank_math_robots',
  // SEOPress
  '_seopress_titles_title',
  '_seopress_titles_desc',
  '_seopress_robots_canonical',
  '_seopress_social_fb_title',
  '_seopress_social_fb_desc',
  '_seopress_robots_index',
  // Universal SitePilot SEO fallback
  '_sitepilot_seo_title',
  '_sitepilot_seo_description',
  '_sitepilot_seo_canonical',
  '_sitepilot_seo_og_title',
  '_sitepilot_seo_og_description',
  '_sitepilot_seo_noindex',
]);

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
        if (
          trimmed.length > 64 ||
          (trimmed.length > 0 && !/^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(trimmed))
        ) {
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

export type UndoToolName =
  | 'content.restore'
  | 'settings.restore'
  | 'terms.restore'
  | 'seo.meta.restore'
  | 'media.restore'
  | 'media.restore_featured'
  | 'menus.restore';

export type UndoResolution =
  | {
      ok: true;
      tool: UndoToolName;
      args: Record<string, unknown>;
      risk: 'R1';
    }
  | {
      ok: false;
      code: 'SNAPSHOT_UNUSABLE' | 'ROLLBACK_UNAVAILABLE';
      message: string;
    };

function parsePositiveId(raw: unknown): number | null {
  const num = typeof raw === 'string' ? Number(raw) : raw;
  return typeof num === 'number' && Number.isInteger(num) && num > 0 ? num : null;
}

function parseNonNegativeId(raw: unknown): number | null {
  const num = typeof raw === 'string' ? Number(raw) : raw;
  return typeof num === 'number' && Number.isInteger(num) && num >= 0 ? num : null;
}

export function resolveUndoJob(snapshot: {
  resource: string;
  before: Record<string, unknown> | null;
}): UndoResolution {
  const resource = (snapshot.resource ?? '').trim();
  const before = snapshot.before ?? null;

  if (resource.startsWith('irreversible:')) {
    return {
      ok: false,
      code: 'ROLLBACK_UNAVAILABLE',
      message: 'This operation cannot be undone automatically.',
    };
  }

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

  if (resource.startsWith('terms:')) {
    const id = parsePositiveId((before as { id?: unknown }).id);
    const taxonomy = (before as { taxonomy?: unknown }).taxonomy;
    const rawTermIds = (before as { termIds?: unknown }).termIds;

    if (
      !id ||
      typeof taxonomy !== 'string' ||
      !/^[a-z0-9_-]{1,64}$/.test(taxonomy) ||
      !Array.isArray(rawTermIds) ||
      rawTermIds.length > 50
    ) {
      return {
        ok: false,
        code: 'SNAPSHOT_UNUSABLE',
        message: 'Terms snapshot is missing post id, taxonomy, or termIds.',
      };
    }

    const termIds: number[] = [];
    for (const entry of rawTermIds) {
      const parsed = parsePositiveId(entry);
      if (!parsed) {
        return {
          ok: false,
          code: 'SNAPSHOT_UNUSABLE',
          message: 'Terms snapshot contains an invalid term id.',
        };
      }
      termIds.push(parsed);
    }

    return {
      ok: true,
      tool: 'terms.restore',
      args: { id, taxonomy, termIds },
      risk: 'R1',
    };
  }

  if (resource.startsWith('seo:')) {
    const id = parsePositiveId((before as { id?: unknown }).id);
    const rawMeta = (before as { meta?: unknown }).meta;
    if (!id || !rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
      return {
        ok: false,
        code: 'SNAPSHOT_UNUSABLE',
        message: 'SEO snapshot is missing post id or meta map.',
      };
    }

    const cleanedMeta: Record<string, string> = {};
    for (const [key, val] of Object.entries(rawMeta as Record<string, unknown>)) {
      if (!ALLOWED_SEO_META_KEYS.has(key) || typeof val !== 'string' || val.length > 1_000) {
        return {
          ok: false,
          code: 'SNAPSHOT_UNUSABLE',
          message: `SEO snapshot contains non-allowlisted meta key "${key}".`,
        };
      }
      cleanedMeta[key] = val;
    }

    if (Object.keys(cleanedMeta).length === 0) {
      return {
        ok: false,
        code: 'SNAPSHOT_UNUSABLE',
        message: 'SEO snapshot has no restorable meta keys.',
      };
    }

    const provider = (before as { provider?: unknown }).provider;
    return {
      ok: true,
      tool: 'seo.meta.restore',
      args: {
        id,
        ...(provider === 'yoast' ||
        provider === 'rankmath' ||
        provider === 'seopress' ||
        provider === 'sitepilot'
          ? { provider }
          : {}),
        meta: cleanedMeta,
      },
      risk: 'R1',
    };
  }

  if (resource.startsWith('media:')) {
    const id = parsePositiveId((before as { id?: unknown }).id);
    if (
      !id ||
      typeof (before as { alt?: unknown }).alt !== 'string' ||
      typeof (before as { title?: unknown }).title !== 'string' ||
      typeof (before as { caption?: unknown }).caption !== 'string' ||
      typeof (before as { description?: unknown }).description !== 'string'
    ) {
      return {
        ok: false,
        code: 'SNAPSHOT_UNUSABLE',
        message: 'Media snapshot is missing attachment id or text fields.',
      };
    }

    return {
      ok: true,
      tool: 'media.restore',
      args: {
        id,
        alt: String((before as { alt: string }).alt).slice(0, 300),
        title: String((before as { title: string }).title).slice(0, 300),
        caption: String((before as { caption: string }).caption).slice(0, 1_000),
        description: String((before as { description: string }).description).slice(0, 4_000),
      },
      risk: 'R1',
    };
  }

  if (resource.startsWith('featured:')) {
    const id = parsePositiveId((before as { id?: unknown }).id);
    const mediaId = parseNonNegativeId((before as { mediaId?: unknown }).mediaId);
    if (!id || mediaId === null) {
      return {
        ok: false,
        code: 'SNAPSHOT_UNUSABLE',
        message: 'Featured-image snapshot is missing post id or mediaId.',
      };
    }

    return {
      ok: true,
      tool: 'media.restore_featured',
      args: { id, mediaId },
      risk: 'R1',
    };
  }

  if (resource.startsWith('menu:')) {
    const menuId = parsePositiveId((before as { menuId?: unknown }).menuId);
    const rawItems = (before as { items?: unknown }).items;
    if (!menuId || !Array.isArray(rawItems) || rawItems.length > 100) {
      return {
        ok: false,
        code: 'SNAPSHOT_UNUSABLE',
        message: 'Menu snapshot is missing menuId or items list.',
      };
    }

    const items: Array<{ title: string; url: string }> = [];
    for (const item of rawItems) {
      if (
        !item ||
        typeof item !== 'object' ||
        typeof (item as { title?: unknown }).title !== 'string' ||
        typeof (item as { url?: unknown }).url !== 'string'
      ) {
        return {
          ok: false,
          code: 'SNAPSHOT_UNUSABLE',
          message: 'Menu snapshot contains malformed menu item.',
        };
      }
      items.push({
        title: String((item as { title: string }).title).slice(0, 120),
        url: String((item as { url: string }).url).slice(0, 500),
      });
    }

    const rawLocations = (before as { locations?: unknown }).locations;
    const locations: Record<string, number> = {};
    if (rawLocations && typeof rawLocations === 'object' && !Array.isArray(rawLocations)) {
      for (const [loc, val] of Object.entries(rawLocations as Record<string, unknown>)) {
        const parsedLocId = parseNonNegativeId(val);
        if (/^[a-z0-9_-]{1,64}$/.test(loc) && parsedLocId !== null) {
          locations[loc] = parsedLocId;
        }
      }
    }

    return {
      ok: true,
      tool: 'menus.restore',
      args: { menuId, items, locations },
      risk: 'R1',
    };
  }

  if ('id' in before) {
    const id = parsePositiveId((before as { id?: unknown }).id);
    if (id) {
      return {
        ok: true,
        tool: 'content.restore',
        args: { before },
        risk: 'R1',
      };
    }
  }

  return {
    ok: false,
    code: 'SNAPSHOT_UNUSABLE',
    message: 'This snapshot does not carry restorable fields.',
  };
}
