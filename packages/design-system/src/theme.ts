import { designTokens, type DesignTokens } from './tokens';

/**
 * Build a CSS custom properties block from design tokens.
 * Intended for consumption by the dashboard (Next.js) via a global stylesheet.
 */
export function tokenToCssVars(t: DesignTokens = designTokens): Record<string, string> {
  const vars: Record<string, string> = {};

  // Flatten a flat record into vars with an optional prefix
  const flatten = (
    obj: Record<string, string | number>,
    prefix = '',
  ): void => {
    for (const [key, value] of Object.entries(obj)) {
      const name = prefix ? `${prefix}-${key}` : key;
      vars[name] = String(value);
    }
  };

  // Namespace each category so no key collisions (e.g. spacing.md vs shadow.md)
  flatten(t.colors as unknown as Record<string, string | number>, '');
  flatten(t.spacing as unknown as Record<string, string | number>, 'spacing');
  flatten(t.radius as unknown as Record<string, string | number>, 'radius');
  flatten(t.shadows as unknown as Record<string, string | number>, 'shadow');

  return vars;
}

export function tokensCss(t: DesignTokens = designTokens): string {
  const vars = tokenToCssVars(t);
  const lines = Object.entries(vars).map(([k, v]) => `  --${k.replace(/_/g, '-')}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}`;
}
