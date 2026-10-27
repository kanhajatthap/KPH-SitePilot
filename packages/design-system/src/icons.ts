/**
 * Minimal inline SVG icons for wp-agent design system.
 * All are WP-Dashicons-compatible names where applicable.
 * Zero third‑party dependencies.
 */

export const iconPaths = {
  block: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z',
  pattern: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v10H7V7zm2 2h6v6H9V9zm2 2h4v4h-4v-4z',
  database: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v2H7V7zm0 4h10v2H7v-2zm0 4h10v2H7v-2z',
  shield: 'M3 3l18 0 0 9c0 5-3 8-9 11-6-3-9-6-9-11V3zm2 2v9c0 4 2 7 7 9 5-2 7-5 7-9V5H5z',
  chat: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z',
  rocket: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v10H7V7zm2 2h6v6H9V9zm2 2h4v4h-4v-4z',
  check: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2l2 2 4-4 4 4 4-4V7l-6-2-2 2-2-2-4 4z',
  close: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2l2 2 4-4 4 4 4-4V7l-6-2-2 2-2-2-4 4z',
  search: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v10H7V7zm2 2h6v6H9V9zm2 2h4v4h-4v-4z',
  settings: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v10H7V7zm2 2h6v6H9V9zm2 2h4v4h-4v-4z',
  external: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v10H7V7zm2 2h6v6H9V9zm2 2h4v4h-4v-4z',
  chevronDown: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2l2 2 4-4 4 4 4-4V7l-6-2-2 2-2-2-4 4z',
  chevronUp: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2l2 2 4-4 4 4 4-4V7l-6-2-2 2-2-2-4 4z',
  chevronLeft: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2l2 2 4-4 4 4 4-4V7l-6-2-2 2-2-2-4 4z',
  chevronRight: 'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2l2 2 4-4 4 4 4-4V7l-6-2-2 2-2-2-4 4z',
} as const;

export type IconName = keyof typeof iconPaths;

export function iconSvg(name: IconName, size = 24): string {
  const path = iconPaths[name];
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="currentColor"/></svg>`;
}