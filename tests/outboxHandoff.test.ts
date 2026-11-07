import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
import type { Database } from '../src/data/db.ts';

const storage = new Map<string, string>();
let failStorage = false, offline = false, revision = 0, remote: Database;
const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (failStorage && key.includes('outbox')) throw Error('synthetic quota');
    storage.set(key, value);
  },
  removeItem: (key: string) => storage.delete(key),
} });
type Store = typeof import('../src/data/store.ts');
let A: Store, B: Store, C: Store, data: typeof import('../src/data/db.ts');
const runtimes: Awaited<ReturnType<typeof createServer>>[] = [];
before(async () => {
  globalThis.fetch = async (_url, options) => {
    if (offline) throw Error('synthetic offline');
    if (options?.method === 'PUT') {
      const body = JSON.parse(options.body as string);
      if (body.expectedUpdatedAt !== String(revision)) return new Response('{}', { status: 409 });
      remote = body.blob;
      return new Response(JSON.stringify({ updatedAt: String(++revision) }));
    }
    return new Response(JSON.stringify({ blob: remote, updatedAt: String(revision), sharedReports: [] }));
  };
  const stores: Store[] = [];
  for (let i = 0; i < 3; i++) {
    const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false },
      define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://test.invalid') } });
    runtimes.push(vite);
    stores.push(await vite.ssrLoadModule('/src/data/store.ts') as Store);
  }
  [A, B, C] = stores;
  data = await runtimes[0].ssrLoadModule('/src/data/db.ts') as typeof data;
});
after(async () => {
  A?.resetLocalStore(); B?.resetLocalStore(); C?.resetLocalStore();
  await Promise.all(runtimes.map(v => v.close()));
  globalThis.fetch = originalFetch;
});
async function release(store: Store, owner: string) {
  store.resetLocalStore();
  // Wait for the real lock to be released, rather than bypassing ownership.
  if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request('training-tracker:' + owner, () => {});
}
async function setup(owner: string) {
  A.resetLocalStore(); B.resetLocalStore(); C.resetLocalStore();
  storage.clear(); failStorage = offline = false; revision = 0;
  remote = data.emptyDatabase();
  await A.hydrateFromServer(owner);
  const dog = A.createDog('Synthetic dog', 'folder'); await A.retrySync();
  return { dog, key: 'abbys-dog-chej:outbox:' + owner };
}
const input = (dogId: string, notes: string) => ({ dogId, notes, phase: 'Phase 1' as const,
  redFlag: false, locationId: null, picture: null, skillIds: [], milestoneIds: [],
  distractions: [], sessionDate: '2026-11-06' });
const ids = (db: Database) => db.reports.map(r => r.id).sort();

test('completed handoff combines distinct volatile and newer durable reports, then syncs and cold-loads both', async () => {
  const owner = 'handoff-distinct', { dog, key } = await setup(owner);
  offline = failStorage = true;
  assert.equal(A.createReport(input(dog.id, 'A exact'), 'a').persisted, false);
  await A.retrySync(); await release(A, owner);
  failStorage = false; await B.hydrateFromServer(owner);
  assert.equal(B.createReport(input(dog.id, 'B exact'), 'b').persisted, true);
  await B.retrySync(); await release(B, owner);
  await A.hydrateFromServer(owner); await A.retrySync();
  assert.deepEqual(ids(A.getSyncState().blob), ['a', 'b']);
  assert.deepEqual(ids(JSON.parse(storage.get(key)!).local), ['a', 'b']);
  offline = false; await A.retrySync();
  assert.deepEqual(ids(remote), ['a', 'b']);
  await release(A, owner); await C.hydrateFromServer(owner);
  assert.deepEqual(C.getSyncState().blob, remote);
  assert.equal(remote.reports.find(r => r.id === 'a')?.notes, 'A exact');
  assert.equal(remote.reports.find(r => r.id === 'b')?.notes, 'B exact');
  await release(C, owner);
});

test('competing edits retain both versions across cold hydration and a failed choice; final choice retains unrelated records', async () => {
  const owner = 'handoff-conflict', { dog, key } = await setup(owner);
  A.createReport(input(dog.id, 'base'), 'same'); await A.retrySync();
  offline = failStorage = true;
  A.createReport(input(dog.id, 'A competing'), 'same'); await A.retrySync(); await release(A, owner);
  failStorage = false; await B.hydrateFromServer(owner);
  B.createReport(input(dog.id, 'B competing'), 'same');
  B.createReport(input(dog.id, 'B independent'), 'b');
  await B.retrySync(); await release(B, owner);
  await A.hydrateFromServer(owner);
  let conflict = A.getSyncState().conflicts[0];
  assert.equal(conflict.source, 'device');
  assert.equal((conflict.local as {notes:string}).notes, 'A competing');
  assert.equal((conflict.remote as {notes:string}).notes, 'B competing');
  const durable = storage.get(key)!;
  const backup = await A.getSyncRecoveryBackup();
  assert.match(JSON.stringify(backup), /A competing/);
  assert.match(JSON.stringify(backup), /B competing/);
  assert.match(JSON.stringify(backup), /B independent/);
  await release(A, owner); await C.hydrateFromServer(owner);
  conflict = C.getSyncState().conflicts[0];
  assert.equal(conflict.source, 'device');
  failStorage = true;
  assert.equal(C.resolveSyncConflict(0, 'local', conflict), false);
  assert.equal(storage.get(key), durable);
  assert.equal(C.getSyncState().conflicts.length, 1);
  failStorage = false;
  assert.equal(C.resolveSyncConflict(0, 'remote', conflict), true);
  await C.retrySync(); offline = false; await C.retrySync();
  assert.equal(remote.reports.find(r => r.id === 'same')?.notes, 'B competing');
  assert.equal(remote.reports.find(r => r.id === 'b')?.notes, 'B independent');
  assert.equal(JSON.parse(storage.get(key)!).recoveries, undefined);
  await release(C, owner);
});

test('unchanged durable snapshot does not turn this page successive edits into a false conflict', async () => {
  const owner = 'handoff-own', { dog } = await setup(owner);
  offline = true; A.createReport(input(dog.id, 'older persisted'), 'same'); await A.retrySync();
  failStorage = true; A.createReport(input(dog.id, 'latest volatile'), 'same'); await A.retrySync();
  await release(A, owner); failStorage = false;
  await A.hydrateFromServer(owner);
  assert.equal(A.getSyncState().conflicts.length, 0);
  assert.equal(A.getSyncState().blob.reports[0].notes, 'latest volatile');
  offline = false; await A.retrySync(); await release(A, owner);
});

test('device choice is reconciled with a newer server revision before publication', async () => {
  const owner = 'handoff-server', { dog } = await setup(owner);
  A.createReport(input(dog.id, 'base'), 'same'); await A.retrySync();
  offline = failStorage = true;
  A.createReport(input(dog.id, 'A competing'), 'same'); await A.retrySync(); await release(A, owner);
  failStorage = false; await B.hydrateFromServer(owner);
  B.createReport(input(dog.id, 'B competing'), 'same'); await B.retrySync(); await release(B, owner);
  await A.hydrateFromServer(owner);
  remote.reports[0].notes = 'new server'; revision++;
  offline = false;
  assert.equal(A.resolveSyncConflict(0, 'local', A.getSyncState().conflicts[0]), true);
  await A.retrySync();
  assert.equal(remote.reports[0].notes, 'new server');
  const conflict = A.getSyncState().conflicts[0];
  assert.equal(conflict.source, undefined);
  assert.equal((conflict.local as {notes:string}).notes, 'A competing');
  assert.equal((conflict.remote as {notes:string}).notes, 'new server');
  assert.equal(A.resolveSyncConflict(0, 'local', conflict), true);
  await A.retrySync(); assert.equal(remote.reports[0].notes, 'A competing');
  await release(A, owner);
});
