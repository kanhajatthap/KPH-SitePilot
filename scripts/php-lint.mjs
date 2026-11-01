#!/usr/bin/env node
/**
 * PHP syntax check without a PHP binary.
 *
 * CI runs the real thing (`php -l`) through shivammathur/setup-php. This script
 * exists so contributors and agents can catch syntax errors locally, where PHP
 * may not be installed. It parses every PHP file under `wordpress/` with the
 * `php-parser` dev dependency and fails on the first syntax error.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import PhpParser from 'php-parser';

const root = fileURLToPath(new URL('..', import.meta.url));
const target = join(root, 'wordpress');

const parser = new PhpParser.Engine({
  parser: { extractDoc: false, suppressErrors: false, version: 704 },
  ast: { withPositions: true },
});

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (entry.toLowerCase().endsWith('.php')) out.push(path);
  }
  return out;
}

const files = walk(target);
let failed = 0;

for (const file of files) {
  const code = readFileSync(file, 'utf8');
  try {
    parser.parseCode(code, relative(root, file));
  } catch (error) {
    failed += 1;
    console.error(`✗ ${relative(root, file)}`);
    console.error(`  ${error.message}`);
    if (error.lineNumber) console.error(`  line ${error.lineNumber}`);
  }
}

if (failed > 0) {
  console.error(`\nPHP syntax check failed for ${failed} of ${files.length} files.`);
  process.exit(1);
}

console.log(`PHP syntax check passed for ${files.length} files (php-parser 7.4 grammar).`);
