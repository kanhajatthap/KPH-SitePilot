import React from 'react';
/** Text-only aligned comparison. Never interprets source as HTML or JavaScript. */
export function SourceDiff({ before, after }: { before: string; after: string }) {
  const left = before.split('\n'); const right = after.split('\n');
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
    {[{ title: 'Before', lines: left, other: right }, { title: 'After', lines: right, other: left }].map(column => <section key={column.title}>
      <h3>{column.title}</h3><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{column.lines.map((line, index) =>
        <span key={index} style={{ display: 'block', background: line !== column.other[index] ? '#fde68a' : undefined, color: line !== column.other[index] ? '#111827' : undefined }}><span aria-hidden="true">{index + 1} </span>{line || ' '}</span>)}</pre>
    </section>)}
  </div>;
}
