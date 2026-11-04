import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isolatedPreviewDocument, safePreviewUrl, PREVIEW_SANDBOX } from '../src/lib/preview-isolation';
describe('static preview isolation policy', () => {
  it('uses no sandbox capabilities and prepends restrictive CSP', () => {
    expect(PREVIEW_SANDBOX).toBe('');
    const attack = '<script>parent.document.body.remove()</script><img src=x onerror=alert(1)>';
    const doc = isolatedPreviewDocument(attack);
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf(attack));
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("form-action 'none'");
  });
  it.each(['javascript:alert(1)', 'data:text/html,x', 'https://user:pass@example.test', '/relative', 'file:///etc/passwd'])('refuses active or credential-bearing URL %s', (url) => {
    expect(safePreviewUrl(url)).toBeUndefined();
  });
  it('allows http and https only', () => {
    expect(safePreviewUrl('https://example.test')).toBe('https://example.test/');
  });
  it('removes direct HTML sinks and permissive live iframe capabilities', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../src/components/PreviewCanvas.tsx'), 'utf8');
    expect(source).not.toContain('dangerouslySetInnerHTML');
    expect(source).not.toContain('allow-scripts');
    expect(source).not.toContain('allow-same-origin');
    expect(source.match(/sandbox=\{PREVIEW_SANDBOX\}/g)).toHaveLength(3);
  });
});
