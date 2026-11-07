import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
import type { Database } from '../src/data/db.ts';
const storage = new Map<string, string>();
let failStorage = false, failLegacyRemoval = false, failLegacyRead = false, failLegacyClaim = false;
let offline = false, offlineWrite = false, lostAck = false, unauthorized = false;
let remote: Database, revision = 0;
const originalFetch = globalThis.fetch;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k: string) => { if (failLegacyRead && k === 'abbys-dog-chej:db:v1') throw new Error('Read denied'); return storage.get(k) ?? null; },
  setItem: (k: string, v: string) => { if (failLegacyClaim && k === 'abbys-dog-chej:db:v1:claimed') throw new Error('Claim denied'); if (failStorage && (k.includes('outbox') || k.includes('server-cache'))) throw new Error('Quota'); storage.set(k, v); },
  removeItem: (k: string) => { if (failLegacyRemoval && k === 'abbys-dog-chej:db:v1') throw new Error('Remove denied'); storage.delete(k); },
} });
let vite: Awaited<ReturnType<typeof createServer>>;
let store: typeof import('../src/data/store.ts');
let data: typeof import('../src/data/db.ts');
before(async () => {
  globalThis.fetch = async (_url, options) => {
    if (offline) throw new Error('offline');
    if (unauthorized) return new Response('{}', { status: 401 });
    if (options?.method === 'PUT') {
      if (offlineWrite) throw new Error('upload interrupted');
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
  store.resetLocalStore(); storage.clear(); offline = offlineWrite = lostAck = unauthorized = failStorage = failLegacyRemoval = failLegacyRead = failLegacyClaim = false;
  remote = data.emptyDatabase(); revision = 0;
  await store.hydrateFromServer('abby');
  const dog = store.createDog('Hubble', 'folder'); await store.retrySync();
  return dog;
}
const input = (dogId: string, notes = 'training') => ({ dogId, phase: 'Phase 1' as const, redFlag: false, locationId: null, notes, picture: null, skillIds: [], milestoneIds: [], distractions: [], sessionDate: '2026-09-14' });

// B0 diagnostic addition: state snapshots for the failure combinations absent from the terse baseline assertions.
import { writeFileSync } from 'node:fs';
const observations: unknown[] = [];
const ids = (blob: any) => (blob?.reports ?? []).map((r: any) => r.id);
function snapshot(mode: string, step: string, persisted?: boolean) {
  const state = store.getSyncState();
  const raw = storage.get('abbys-dog-chej:outbox:abby');
  const outbox = raw ? JSON.parse(raw) : null;
  const row = { mode, step, persisted, status: state.status, memory: ids(state.blob), durableLocal: ids(outbox?.local), confirmedBase: ids(outbox?.base), server: ids(remote), serverRevision: revision, outboxRevision: outbox?.revision, batchId: outbox?.batchId };
  observations.push(row); return row;
}
after(() => { if (process.env.B0_DIAGNOSTIC_OUTPUT) writeFileSync(process.env.B0_DIAGNOSTIC_OUTPUT, JSON.stringify(observations, null, 2)); });
for (const mode of ['offline','upload-failure','401','lost-ack','quota-online','quota-offline-keep','quota-offline-relaunch']) {
  test(`B0 diagnostic ${mode}: stable report ID and explicit durability`, async () => {
    const dog = await setup();
    const reportId = `synthetic-${mode}`;
    offline = mode === 'offline' || mode.startsWith('quota-offline');
    offlineWrite = mode === 'upload-failure'; unauthorized = mode === '401'; lostAck = mode === 'lost-ack'; failStorage = mode.startsWith('quota');
    const { persisted } = store.createReport(input(dog.id), reportId);
    snapshot(mode, 'immediate', persisted);
    await store.retrySync(); const failed = snapshot(mode, 'after-failure');
    assert.deepEqual(failed.memory, [reportId]);
    assert.equal(persisted, !failStorage);
    assert.equal(failed.status, failStorage ? 'storage-error' : unauthorized ? 'auth' : 'pending');
    assert.deepEqual(failed.durableLocal, failStorage ? [] : [reportId]);
    assert.deepEqual(failed.server, mode === 'lost-ack' || mode === 'quota-online' ? [reportId] : []);
    if(mode === 'quota-offline-keep') {
      // Same mounted form, same ID: no duplicate even after another failed Save.
      assert.equal(store.createReport(input(dog.id,'edited while pending'), reportId).persisted,false);
      await store.retrySync(); snapshot(mode,'same-id-retry');
    } else {
      store.resetLocalStore(); snapshot(mode, 'simulated-close');
    }
    offline = offlineWrite = unauthorized = lostAck = failStorage = false;
    if (mode === 'quota-offline-relaunch') {
      // A store reset is now an in-page logout, not a browser termination.
      // Reload the module runtime to model a genuinely lost memory snapshot.
      await vite.close();
      vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://test.invalid') } });
      store = await vite.ssrLoadModule('/src/data/store.ts') as typeof store;
      data = await vite.ssrLoadModule('/src/data/db.ts') as typeof data;
    }
    if(mode !== 'quota-offline-keep') await store.hydrateFromServer('abby');
    await store.retrySync(); const recovered = snapshot(mode, 'recovered');
    const expected = mode === 'quota-offline-relaunch' ? [] : [reportId];
    assert.deepEqual(recovered.memory, expected);assert.deepEqual(recovered.durableLocal,expected);assert.deepEqual(recovered.server,expected);assert.equal(recovered.status,'synced');
    if(mode==='quota-offline-keep')assert.equal(remote.reports[0].notes,'edited while pending');
  });
}
