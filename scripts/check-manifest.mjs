#!/usr/bin/env node
/** Check a staged artifact manifest without mutating source. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(process.argv[2] ?? process.cwd());
const manifest = path.join(root, 'MANIFEST.sha256');
const text = await fs.readFile(manifest, 'utf8');
const entries = text.trim() ? text.trim().split('\n') : [];
const seen = new Set();
for (const line of entries) {
  const match = line.match(/^([a-f0-9]{64})  (.+)$/);
  if (!match) throw new Error(`Malformed manifest line: ${line}`);
  const [, expected, relative] = match;
  if (seen.has(relative)) throw new Error(`Duplicate manifest path: ${relative}`);
  seen.add(relative);
  const target = path.resolve(root, relative);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Manifest traversal: ${relative}`);
  const actual = createHash('sha256').update(await fs.readFile(target)).digest('hex');
  if (actual !== expected) throw new Error(`Integrity mismatch: ${relative}`);
}
console.log(JSON.stringify({ root, manifest: path.relative(root, manifest), entries: entries.length, status: 'PASS' }, null, 2));
