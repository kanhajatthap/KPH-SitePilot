/** Untrusted preview documents get an opaque origin and no active capabilities. */
export const PREVIEW_SANDBOX = '';
export function isolatedPreviewDocument(html: string): string {
  // CSP precedes all untrusted markup. Only inline styles and embedded images are
  // needed for a static preview; no script, forms, remote fetch or base URL.
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"></head><body>${html}</body></html>`;
}
export function safePreviewUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}
