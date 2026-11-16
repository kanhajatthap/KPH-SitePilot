import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { SourceDiff } from '../src/components/restricted-review/source-diff';
import fs from 'node:fs';
describe('source review UI boundary', () => {
  it('escapes hostile source instead of executing HTML', () => {
    const html = renderToStaticMarkup(<SourceDiff before={'<script>alert(1)</script>'} after={'<img src=x onerror=alert(1)>'} />);
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img'); expect(html).toContain('&lt;script&gt;'); expect(html).toContain('&lt;img');
  });
  it('does not expose a run button or send source in approval requests', () => {
    const source = fs.readFileSync(new URL('../src/app/restricted-review/page.tsx', import.meta.url), 'utf8');
    expect(source).toContain('Record review — no execution'); expect(source).toContain('result.executionAllowed !== false');
    expect(source).not.toContain('dangerouslySetInnerHTML'); expect(source).not.toContain('/jobs');
  });
});
