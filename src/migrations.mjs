import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite, hash, migrateState, noSymlinks, requireThat, withLock } from './io.mjs';

async function rawState(root) {
  await noSymlinks(root, '.far/state.json');
  return fs.readFile(path.join(root, '.far/state.json'), 'utf8');
}

export async function inspectMigration(root) {
  const raw = await rawState(root);
  const value = JSON.parse(raw);
  requireThat(value.root === root, 'State relocation requires explicit migration intent', 'STATE_INVALID');
  if (value.schemaVersion === 2) return { status: 'already-migrated', from: 2, to: 2, sourceDigest: hash(raw), bytes: raw.length };
  requireThat(value.schemaVersion === 1, `Unsupported state schema ${value.schemaVersion}`, 'MIGRATION_UNSUPPORTED');
  const migrated = await migrateState(value, root);
  return { status: 'ready', from: 1, to: 2, sourceDigest: hash(raw), bytes: raw.length, mapped: { fieldsPreserved: ['tasks', 'findings', 'runs', 'reviews', 'contract'], defaulted: ['policy', 'budget', 'dispatch', 'progress'] }, stateDigest: hash(migrated) };
}

export async function migrate(root, { dryRun = true } = {}) {
  return withLock(root, async () => {
    const raw = await rawState(root);
    const value = JSON.parse(raw);
    requireThat(value.root === root, 'State relocation requires explicit migration intent', 'STATE_INVALID');
    if (value.schemaVersion === 2) return { status: 'already-migrated', from: 2, to: 2, sourceDigest: hash(raw) };
    requireThat(value.schemaVersion === 1, `Unsupported state schema ${value.schemaVersion}`, 'MIGRATION_UNSUPPORTED');
    const sourceDigest = hash(raw), migrated = await migrateState(value, root);
    const backup = `.far/backups/state-v1-${sourceDigest}.json`;
    if (dryRun) return { status: 'dry-run', from: 1, to: 2, sourceDigest, backup, stateDigest: hash(migrated) };
    await atomicWrite(root, backup, raw);
    migrated.migration = { sourceSchema: 1, targetSchema: 2, sourceDigest, backup, at: new Date().toISOString() };
    await atomicWrite(root, '.far/state.json', migrated);
    return { status: 'applied', from: 1, to: 2, sourceDigest, backup, stateDigest: hash(migrated) };
  });
}

export async function restore(root, backup) {
  return withLock(root, async () => {
    const current = await rawState(root);
    const backupRaw = await fs.readFile(path.join(root, backup), 'utf8');
    const value = JSON.parse(backupRaw);
    requireThat(value.schemaVersion === 1 && value.root === root, 'Restore requires a version-matched schema-v1 backup', 'RESTORE_INVALID');
    const preserved = `.far/backups/post-restore-${hash(current)}.json`;
    await atomicWrite(root, preserved, current);
    await atomicWrite(root, '.far/state.json', backupRaw);
    return { status: 'restored', backup, preserved, sourceDigest: hash(backupRaw), preservedDigest: hash(current) };
  });
}
