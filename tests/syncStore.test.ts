import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import type { Database } from '../src/data/db.ts';
const storage = new Map<string, string>();
let failStorage = false, offline = false, lostAck = false, unauthorized = false;
let remote: Database, revision = 0;
const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { if (failStorage && (k.includes('outbox') || k.includes('server-cache'))) throw new Error('Quota'); storage.set(k, v); },
  removeItem: (k: string) => storage.delete(k),
} });
let vite: Awaited<ReturnType<typeof createServer>>;
let store: typeof import('../src/data/store.ts');
let data: typeof import('../src/data/db.ts');
before(async () => {
  globalThis.fetch = async (_url, options) => {
    if (offline) throw new Error('offline');
    if (unauthorized) return new Response('{}', { status: 401 });
    if (options?.method === 'PUT') {
      const body = JSON.parse(options.body as string);
      if (body.expectedUpdatedAt !== String(revision)) return new Response('{}', { status: 409 });
      remote = body.blob; revision++;
      if (lostAck) throw new Error('response lost');
      return new Response(JSON.stringify({ updatedAt: String(revision) }));
    }
    return new Response(JSON.stringify({ blob: remote, updatedAt: String(revision), sharedReports: [] }));
  };
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://test.invalid') } });
  store = await vite.ssrLoadModule('/src/data/store.ts') as typeof store;
  data = await vite.ssrLoadModule('/src/data/db.ts') as typeof data;
});
after(async () => { store.resetLocalStore(); await vite.close(); globalThis.fetch = originalFetch; });
async function setup() {
  store.resetLocalStore(); storage.clear(); offline = lostAck = unauthorized = failStorage = false;
  remote = data.emptyDatabase(); revision = 0;
  await store.hydrateFromServer('abby');
  const dog = store.createDog('Hubble', 'folder'); await store.retrySync();
  return dog;
}
const input = (dogId: string, notes = 'training') => ({ dogId, phase: 'Phase 1' as const, redFlag: false, locationId: null, notes, picture: null, skillIds: [], milestoneIds: [], distractions: [], sessionDate: '2026-09-14' });

test('real report save: offline acknowledgement is local only; rehydrate preserves and uploads after relaunch', async () => {
  const dog = await setup(); offline = true;
  assert.equal(store.createReport(input(dog.id), 'report-1').persisted, true);
  await store.retrySync(); assert.equal(remote.reports.length, 0); assert.equal(store.getSyncState().status, 'pending');
  store.resetLocalStore(); offline = false; await store.hydrateFromServer('abby'); await store.retrySync();
  assert.equal(remote.reports.length, 1); assert.equal(remote.reports[0].id, 'report-1');
  assert.equal(store.getSyncState().status, 'synced');
});

test('real report form retry after quota failure uses the same report ID', async () => {
  const dog = await setup(); failStorage = true;
  assert.equal(store.createReport(input(dog.id), 'report-1').persisted, false);
  await store.retrySync(); assert.equal(remote.reports.length, 1);
  assert.equal(store.createReport(input(dog.id), 'report-1').persisted, false);
  await store.retrySync(); assert.equal(remote.reports.length, 1);
  failStorage = false; await store.retrySync();
});

test('lost server acknowledgement and expired session both recover without another log entry', async () => {
  const dog = await setup(); lostAck = true;
  store.createReport(input(dog.id), 'report-1'); await store.retrySync(); assert.equal(remote.reports.length, 1);
  store.resetLocalStore(); lostAck = false; unauthorized = true;
  await assert.rejects(store.hydrateFromServer('abby'));
  unauthorized = false; await store.hydrateFromServer('abby'); await store.retrySync();
  assert.equal(remote.reports.length, 1); assert.equal(store.getSyncState().status, 'synced');
});

test('another account cannot inherit Abby pending edits', async () => {
  const dog = await setup(); offline = true;
  store.createReport(input(dog.id), 'abby-only'); await store.retrySync(); store.resetLocalStore();
  remote = data.emptyDatabase(); offline = false; await store.hydrateFromServer('other'); await store.retrySync();
  assert.equal(store.getSyncState().blob.reports.length, 0);
  assert.ok(storage.get('abbys-dog-chej:outbox:abby')?.includes('abby-only'));
});

test('legacy cache differences are retained for recovery instead of overwritten by successful GET', async () => {
  const dog = await setup(); offline = true;
  store.createReport(input(dog.id), 'old-cache-log'); await store.retrySync(); store.resetLocalStore();
  storage.delete('abbys-dog-chej:outbox:abby'); offline = false;
  await store.hydrateFromServer('abby'); await store.retrySync();
  assert.ok(store.getSyncState().blob.reports.some(r => r.id === 'old-cache-log'));
  assert.ok(remote.reports.some(r => r.id === 'old-cache-log'));
});

test('editing the form after failed persistence updates privacy and skills on the same log', async () => {
  const dog = await setup(); const skill = store.getSyncState().blob.checklistItems[0];
  failStorage = true; offline = true;
  store.createReport(input(dog.id), 'retry-log'); await store.retrySync();
  store.createReport({ ...input(dog.id), redFlag: true, skillIds: [skill.id] }, 'retry-log');
  assert.equal(store.getSyncState().blob.reports.length, 1);
  assert.equal(store.getSyncState().blob.reports[0].visibility, 'private');
  assert.ok(store.getSyncState().blob.completions.some(c => c.checklistItemId === skill.id && c.inProgress));
  assert.throws(() => store.createReport(input('another-dog'), 'retry-log'));
  await store.retrySync(); failStorage = false; offline = false; await store.retrySync();
  assert.equal(remote.reports[0].visibility, 'private');
});

test('a token replaced by another tab cannot redirect pending data into that account', async () => {
  const dog = await setup(); offline = true;
  store.createReport(input(dog.id), 'abby-only'); await store.retrySync();
  const api = await vite.ssrLoadModule('/src/lib/api.ts');
  api.setToken('different-account-token'); offline = false;
  const previous = JSON.stringify(remote);
  await store.retrySync();
  assert.equal(JSON.stringify(remote), previous);
  assert.equal(store.getSyncState().status, 'auth');
  assert.ok(storage.get('abbys-dog-chej:outbox:abby')?.includes('abby-only'));
});

test('overlapping startup hydrations cannot strand an obsolete tab lock', async () => {
  await setup(); store.resetLocalStore();
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'locks');
  Object.defineProperty(globalThis.navigator, 'locks', { configurable: true, value: {
    async request(_name: string, _options: unknown, callback: (lock: object) => Promise<void>) {
      await new Promise(resolve => setImmediate(resolve));
      return callback({});
    },
  } });
  try {
    const first = store.hydrateFromServer('abby');
    // Let first request start, then supersede it before its callback runs.
    await Promise.resolve();
    const second = store.hydrateFromServer('abby');
    let timer: ReturnType<typeof setTimeout>;
    await Promise.race([Promise.all([first, second]), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('stranded lock')), 1000); })]).finally(() => clearTimeout(timer));
    assert.equal(store.getSyncState().status, 'synced');
  } finally {
    store.resetLocalStore();
    if (original) Object.defineProperty(globalThis.navigator, 'locks', original);
    else Reflect.deleteProperty(globalThis.navigator, 'locks');
  }
});
