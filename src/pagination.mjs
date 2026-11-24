/** Stable cursor pagination for ledger collections. */
import { createHash } from 'node:crypto';

const encode = value => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const decode = value => {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw new Error('Invalid pagination cursor'); }
};

export function paginate(items, { cursor = null, limit = 50, revision = null, key = 'id' } = {}) {
  if (!Array.isArray(items)) throw new Error('Pagination requires an array');
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error('Pagination limit must be 1..500');
  const fingerprint = createHash('sha256').update(JSON.stringify(items.map(item => item?.[key] ?? item))).digest('hex');
  const start = cursor ? decode(cursor) : { offset: 0, fingerprint };
  if (start.fingerprint && start.fingerprint !== fingerprint) throw new Error('Pagination cursor is stale; restart from the current collection');
  const offset = Number.isInteger(start.offset) && start.offset >= 0 ? start.offset : 0;
  const page = items.slice(offset, offset + limit);
  const nextCursor = offset + page.length < items.length ? encode({ offset: offset + page.length, fingerprint }) : null;
  return { items: page, nextCursor, totalKnown: items.length, snapshotRevision: revision, cursorFingerprint: fingerprint };
}
