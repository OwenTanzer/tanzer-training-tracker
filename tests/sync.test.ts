import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SyncEngine, copy, equal, merge, type Document, type Envelope, type Status } from '../src/lib/sync.ts';

const empty = (): Document => ({ reports: [], dogs: [] });
const err = (status: number) => Object.assign(new Error('simulated'), { status });
function harness(initial = empty()) {
  let server = copy(initial), revision = 'r0', durable: Envelope | null = null;
  let mode: 'online' | 'offline' | 'auth' | 'lost-ack' = 'online';
  let quota = false, writes = 0, status: Status = 'idle';
  let gate: Promise<void> | null = null;
  const engines: SyncEngine[] = [];
  const create = (saved?: Envelope) => {
    const engine = new SyncEngine({
      read: async () => {
        if (gate) await gate;
        if (mode === 'offline') throw err(0);
        if (mode === 'auth') throw err(401);
        return { blob: copy(server), updatedAt: revision };
      },
      write: async (blob, expected) => {
        if (mode === 'offline') throw err(0);
        if (expected !== revision) throw err(409);
        server = copy(blob); revision = `r${++writes}`;
        if (mode === 'lost-ack') throw err(0);
        return { updatedAt: revision };
      },
      persist: e => { if (quota) return false; durable = copy(e); return true; },
      changed: (_blob, next) => { status = next; }, diagnostic: () => {},
    }, saved ?? { base: initial, local: initial, revision, batchId: 'initial' });
    engines.push(engine); return engine;
  };
  return { create, setMode: (m: typeof mode) => { mode = m; }, setQuota: (q: boolean) => { quota = q; },
    setGate: (p: Promise<void> | null) => { gate = p; },
    remote: () => server, saved: () => copy(durable!), status: () => status, writes: () => writes,
    external: (data: Document) => { server = copy(data); revision = `external-${writes}`; },
    stop: () => engines.forEach(e => e.stop()) };
}

test('independent record additions merge; identical retry is a no-op; same record and deletion/edit require a choice', () => {
  const a = { id: 'a', notes: 'original' }, b = { id: 'b', notes: 'second' };
  assert.deepEqual(merge({ reports: [] }, { reports: [a] }, { reports: [b] }), { blob: { reports: [b, a] }, conflicts: [] });
  assert.equal(merge({ reports: [] }, { reports: [a] }, { reports: [a] }).conflicts.length, 0);
  const local = { ...a, notes: 'phone' }, remote = { ...a, notes: 'other' };
  assert.equal(merge({ reports: [a] }, { reports: [local] }, { reports: [remote] }).conflicts.length, 1);
  assert.equal(merge({ reports: [a] }, { reports: [] }, { reports: [remote] }).conflicts.length, 1);
  assert.deepEqual(merge({ reports: [a] }, { reports: [] }, { reports: [a] }).blob.reports, []);
});

test('offline save survives closing, reopening and newer server data without another edit', async () => {
  const h = harness();
  try {
    h.setMode('offline'); const first = h.create();
    assert.equal(first.stage({ ...empty(), reports: [{ id: 'phone', notes: 'Hubble' }] }), true);
    await first.flush(); first.stop();
    h.external({ ...empty(), reports: [{ id: 'other', notes: 'Another log' }] }); h.setMode('online');
    const reopened = h.create(h.saved()); await reopened.flush();
    assert.deepEqual((h.remote().reports as { id: string }[]).map(x => x.id), ['other', 'phone']);
    assert.equal(h.status(), 'synced'); assert.ok(equal(h.saved().base, h.saved().local));
  } finally { h.stop(); }
});

test('successful upload with lost acknowledgement and retry after relaunch never duplicates', async () => {
  const h = harness();
  try {
    h.setMode('lost-ack'); const first = h.create();
    first.stage({ ...empty(), reports: [{ id: 'stable-report', notes: 'once' }] }); await first.flush(); first.stop();
    assert.equal(h.writes(), 1); h.setMode('online');
    await h.create(h.saved()).flush();
    assert.equal(h.writes(), 1); assert.equal((h.remote().reports as unknown[]).length, 1); assert.equal(h.status(), 'synced');
  } finally { h.stop(); }
});

test('session expiry retains pending data until same account signs back in', async () => {
  const h = harness();
  try {
    h.setMode('auth'); const first = h.create(); first.stage({ ...empty(), reports: [{ id: 'log' }] }); await first.flush(); first.stop();
    assert.equal(h.status(), 'auth'); h.setMode('online'); await h.create(h.saved()).flush();
    assert.equal((h.remote().reports as unknown[]).length, 1);
  } finally { h.stop(); }
});

test('edits during an upload survive its acknowledgement and are included in the next immutable batch', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let saved!: Envelope;
  const sent: Document[] = [];
  const engine = new SyncEngine({ read: async () => ({ blob: empty(), updatedAt: 'r0' }),
    write: async blob => { sent.push(copy(blob)); if (sent.length === 1) await gate; return { updatedAt: `r${sent.length}` }; },
    persist: e => { saved = copy(e); return true; }, changed: () => {}, diagnostic: () => {},
  }, { base: empty(), local: empty(), revision: 'r0', batchId: 'initial' });
  try {
    engine.stage({ ...empty(), reports: [{ id: 'a' }] }); await new Promise(resolve => setImmediate(resolve));
    engine.stage({ ...empty(), reports: [{ id: 'a' }, { id: 'b' }] });
    assert.equal((saved.local.reports as unknown[]).length, 2);
    release(); await engine.flush();
    assert.deepEqual(sent.map(x => (x.reports as unknown[]).length), [1, 2]); assert.ok(equal(saved.base, saved.local));
  } finally { engine.stop(); }
});

test('conflicts survive relaunch and resolving one record preserves independent additions', async () => {
  const original = { id: 'a', notes: 'original' };
  const h = harness({ ...empty(), reports: [original] });
  try {
    h.setMode('offline'); const first = h.create(); first.stage({ ...empty(), reports: [{ ...original, notes: 'phone' }, { id: 'new' }] });
    await first.flush(); first.stop(); h.external({ ...empty(), reports: [{ ...original, notes: 'server' }, { id: 'other' }] }); h.setMode('online');
    const second = h.create(h.saved()); await second.flush(); assert.equal(h.status(), 'conflict'); assert.equal(h.writes(), 0); second.stop();
    const third = h.create(h.saved()); await third.flush(); assert.equal(third.conflicts.length, 1);
    third.resolve(0, 'remote'); await third.flush();
    assert.deepEqual(h.remote().reports, [{ ...original, notes: 'server' }, { id: 'other' }, { id: 'new' }]);
  } finally { h.stop(); }
});

test('quota failure is never called a successful local save, but server acknowledgement can still preserve the edit', async () => {
  const h = harness();
  try {
    h.setQuota(true); const e = h.create(); assert.equal(e.stage({ ...empty(), reports: [{ id: 'a' }] }), false);
    await e.flush(); assert.equal((h.remote().reports as unknown[]).length, 1);
  } finally { h.stop(); }
});

test('deleting a dog cannot hide a new log added by another device', () => {
  const dog = { id: 'dog', name: 'Hubble' };
  const result = merge({ dogs: [dog], reports: [] }, { dogs: [], reports: [] }, { dogs: [dog], reports: [{ id: 'new-log', dogId: 'dog' }] });
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].deletionBlocked, true);
  assert.deepEqual(result.blob.dogs, [dog]);
  assert.equal((result.blob.reports as unknown[]).length, 1);
});

test('an asynchronous form completion during conflict recovery is retained when choosing a version', async () => {
  const h = harness({ ...empty(), reports: [{ id: 'a', notes: 'base' }] });
  try {
    h.setMode('offline'); const e = h.create(); e.stage({ ...empty(), reports: [{ id: 'a', notes: 'phone' }] }); await e.flush();
    h.external({ ...empty(), reports: [{ id: 'a', notes: 'server' }] }); h.setMode('online'); await e.flush();
    e.stage({ ...empty(), reports: [{ id: 'a', notes: 'phone' }, { id: 'late-photo-log' }] });
    e.resolve(0, 'remote'); await e.flush();
    assert.ok((h.remote().reports as { id: string }[]).some(r => r.id === 'late-photo-log'));
  } finally { h.stop(); }
});

test('edited parent versus remote deletion cannot delete the parent of a retained new log', () => {
  const dog = { id: 'dog', name: 'Hubble' };
  const result = merge({ dogs: [dog], reports: [] }, { dogs: [{ ...dog, name: 'Edited' }], reports: [{ id: 'log', dogId: 'dog' }] }, { dogs: [], reports: [] });
  assert.equal(result.conflicts[0].deletionBlocked, true);
});

test('report-only milestone and location references retain concurrently deleted definitions', () => {
  const template = { id: 'm' }, location = { id: 'l' };
  const result = merge({ milestoneTemplates: [template], locations: [location], reports: [] },
    { milestoneTemplates: [], locations: [], reports: [] },
    { milestoneTemplates: [template], locations: [location], reports: [{ id: 'log', milestoneIds: ['m'], locationId: 'l' }] });
  assert.equal(result.conflicts.length, 2);
  assert.deepEqual(result.blob.milestoneTemplates, [template]);
  assert.deepEqual(result.blob.locations, [location]);
});

test('concurrent folder moves cannot silently produce a cycle; recovery retains unrelated new folders', () => {
  const a = { id: 'a', parentFolderId: null }, b = { id: 'b', parentFolderId: null }, c = { id: 'c', parentFolderId: null };
  const result = merge({ folders: [a, b] }, { folders: [{ ...a, parentFolderId: 'b' }, b] }, { folders: [a, { ...b, parentFolderId: 'a' }, c] });
  const conflict = result.conflicts.find(x => x.collection === 'folders' && x.id === undefined)!;
  assert.ok(conflict);
  for (const side of ['local', 'remote'] as const) assert.ok((conflict[side] as { id: string }[]).some(x => x.id === 'c'));
});

test('resolving a folder cycle preserves a separately chosen folder name', async () => {
  const a = { id: 'a', name: 'A', parentFolderId: null }, b = { id: 'b', name: 'B', parentFolderId: null };
  const h = harness({ folders: [a, b] });
  try {
    const e = h.create(); h.setMode('offline');
    e.stage({ folders: [{ ...a, name: 'local A', parentFolderId: 'b' }, b] }); await e.flush();
    h.external({ folders: [{ ...a, name: 'remote A' }, { ...b, parentFolderId: 'a' }] }); h.setMode('online'); await e.flush();
    assert.equal(e.conflicts.length, 2);
    e.resolve(e.conflicts.findIndex(c => c.id === 'a'), 'remote');
    e.resolve(e.conflicts.findIndex(c => c.folderMovesOnly), 'remote'); await e.flush();
    assert.equal((h.remote().folders as { id: string; name: string }[]).find(f => f.id === 'a')?.name, 'remote A');
  } finally { h.stop(); }
});

test('two devices cannot create duplicate progress records for the same dog and skill', () => {
  const a = { id: 'phone-id', dogId: 'dog', checklistItemId: 'skill', inProgress: true };
  const b = { ...a, id: 'other-id' };
  const result = merge({ completions: [] }, { completions: [a] }, { completions: [b] });
  assert.equal((result.blob.completions as unknown[]).length, 1);
  assert.equal(result.conflicts.length, 1);
});

test('a conflict choice under failed storage retains the unresolved local version', async () => {
  const h = harness({ reports: [{ id: 'r', notes: 'base' }] });
  try { h.setMode('offline'); const e = h.create(); e.stage({ reports: [{ id: 'r', notes: 'local' }] }); await e.flush(); h.external({ reports: [{ id: 'r', notes: 'remote' }] }); h.setMode('online'); await e.flush();
    const before = e.envelope(), alternatives = copy(e.conflicts), durable = h.saved(); h.setQuota(true); e.resolve(0, 'remote');
    assert.deepEqual(e.envelope(), before); assert.deepEqual(e.conflicts, alternatives); assert.deepEqual(h.saved(), durable); assert.equal(h.writes(), 0);
  } finally { h.stop(); }
});

test('a choice whose final persistence fails retains both alternatives and original envelope', async () => {
  const base = { reports: [{ id: 'r', notes: 'base' }] }, local = { reports: [{ id: 'r', notes: 'local' }] }, remote = { reports: [{ id: 'r', notes: 'remote' }] };
  let calls = 0, failAt = Infinity, writes = 0, volatile: Envelope | null = null;
  const e = new SyncEngine({ read: async () => ({ blob: remote, updatedAt: 'r2' }), write: async () => { writes++; return { updatedAt: 'r3' }; }, persist: value => { volatile = copy(value); return ++calls < failAt; }, changed: () => {}, diagnostic: () => {} }, { base, local, revision: 'r1', batchId: 'stable' });
  try {
    await e.flush(); const before = e.envelope(), alternatives = copy(e.conflicts);
    failAt = calls + 2; const resolved = e.resolve(0, 'remote');
    assert.deepEqual(e.envelope(), before); assert.deepEqual(e.conflicts, alternatives); assert.equal(resolved, false); assert.deepEqual(volatile, before); assert.equal(writes, 0); assert.equal(e.status, 'storage-error');
    failAt = Infinity; assert.equal(e.resolve(0, 'remote'), true); await e.flush(); assert.deepEqual(e.envelope().local, remote);
  } finally { e.stop(); }
});

test('both stale displayed choices reconcile with a newer server before publishing', async () => {
  for (const side of ['local', 'remote'] as const) {
    const h = harness({ reports: [{ id: 'r', notes: 'base' }] });
    try { h.setMode('offline'); const e = h.create(); e.stage({ reports: [{ id: 'r', notes: 'local' }] }); await e.flush(); h.external({ reports: [{ id: 'r', notes: 'shown remote' }] }); h.setMode('online'); await e.flush(); h.external({ reports: [{ id: 'r', notes: 'unseen newest' }] }); e.resolve(0, side); await e.flush();
      assert.equal((h.remote().reports as any[])[0].notes, 'unseen newest'); assert.equal(h.writes(), 0);
      if (side === 'local') { assert.equal(e.conflicts.length, 1); assert.equal((e.conflicts[0].remote as any).notes, 'unseen newest'); }
      else assert.deepEqual(e.envelope().local, h.remote());
    } finally { h.stop(); }
  }
});

test('deferred recovery survives reopen while new work syncs, then can be resolved', async () => {
  const initial = { reports: [], dogs: [{ id: 'dog', name: 'Original' }] };
  const h = harness(initial);
  try {
    const e = h.create();
    h.external({ ...initial, dogs: [{ id: 'dog', name: 'Server' }] });
    e.stage({ ...initial, dogs: [{ id: 'dog', name: 'Phone' }] }); await e.flush();
    assert.equal(e.conflicts.length, 1);
    assert.equal(await e.deferRecovery(), true);
    assert.equal(e.conflicts.length, 0); assert.equal(e.deferredCount(), 1);
    assert.equal(h.writes(), 0); assert.equal((e.local.dogs as any[])[0].name, 'Server');
    e.stop(); const reopened = h.create(h.saved()); await reopened.flush();
    assert.equal(reopened.conflicts.length, 0); assert.equal(reopened.deferredCount(), 1);
    reopened.stage({ ...reopened.local, reports: [{ id: 'new', notes: 'New ordinary work' }] }); await reopened.flush();
    assert.equal((h.remote().reports as any[])[0].id, 'new');
    assert.equal(await reopened.resumeRecovery(), true); assert.equal(reopened.conflicts.length, 1);
    assert.equal(reopened.resolve(0, 'local'), true); await reopened.flush();
    assert.equal((h.remote().dogs as any[])[0].name, 'Phone');
    assert.equal((h.remote().reports as any[])[0].id, 'new');
    assert.equal(reopened.deferredCount(), 0);
  } finally { h.stop(); }
});

test('failed deferred persistence still opens confirmed data and retains pending edits in memory', async () => {
  const initial = { reports: [{ id: 'r', notes: 'Original' }], dogs: [] };
  const h = harness(initial);
  try {
    const e = h.create(); h.external({ ...initial, reports: [{ id: 'r', notes: 'Server' }] });
    e.stage({ ...initial, reports: [{ id: 'r', notes: 'Phone' }] }); await e.flush();
    const before = h.saved(); h.setQuota(true);
    assert.equal(await e.deferRecovery(), true); assert.equal(e.conflicts.length, 0);
    assert.deepEqual(e.local, h.remote()); assert.equal(e.deferredCount(), 1);
    assert.deepEqual(e.envelope().deferred![0].local, before.local);
    assert.deepEqual(h.saved(), before); assert.equal(h.writes(), 0);
  } finally { h.stop(); }
});

test('offline continuation opens last confirmed data without a fresh read', async () => {
  const initial = { reports: [], dogs: [{ id: 'dog', name: 'Original' }] };
  const h = harness(initial);
  try {
    const e = h.create(); h.external({ ...initial, dogs: [{ id: 'dog', name: 'Server' }] });
    e.stage({ ...initial, dogs: [{ id: 'dog', name: 'Phone' }] }); await e.flush();
    h.setMode('offline'); assert.equal(await e.deferRecovery(), true);
    assert.equal(e.conflicts.length, 0); assert.equal(e.deferredCount(), 1);
    assert.equal((e.local.dogs as any[])[0].name, 'Server');
    assert.equal((e.envelope().deferred![0].local.dogs as any[])[0].name, 'Phone');
  } finally { h.stop(); }
});

test('device handoff conflicts can be deferred without dropping either pending branch', async () => {
  const base = { reports: [], dogs: [{ id: 'dog', name: 'Original' }] };
  const h = harness(base);
  try {
    const e = h.create({ base, local: { ...base, dogs: [{ id: 'dog', name: 'Other tab' }] }, revision: 'r0', batchId: 'handoff', recoveries: [{ base, local: { ...base, dogs: [{ id: 'dog', name: 'Earlier page' }] } }] });
    await e.flush(); assert.equal(e.conflicts[0].source, 'device');
    assert.equal(await e.deferRecovery(), true); assert.equal(e.deferredCount(), 2);
    const saved = h.saved(); e.stop(); const reopened = h.create(saved); await reopened.flush();
    assert.equal(reopened.conflicts.length, 0); assert.equal(reopened.deferredCount(), 2);
    assert.equal(await reopened.resumeRecovery(), true); assert.equal(reopened.conflicts.length, 1);
    assert.equal(reopened.resolve(0, 'local'), true); await reopened.flush();
    assert.equal(reopened.conflicts.length, 0);
    assert.equal((h.remote().dogs as any[])[0].name, 'Earlier page');
  } finally { h.stop(); }
});

test('reviewing earlier changes waits for a sync already in flight', async () => {
  const initial = { reports: [], dogs: [{ id: 'dog', name: 'Original' }] };
  const h = harness(initial);
  try {
    const e = h.create(); h.external({ ...initial, dogs: [{ id: 'dog', name: 'Server' }] });
    e.stage({ ...initial, dogs: [{ id: 'dog', name: 'Phone' }] }); await e.flush();
    assert.equal(await e.deferRecovery(), true);
    let release!: () => void;
    h.setGate(new Promise<void>(resolve => { release = resolve; }));
    const syncing = e.flush(), reviewing = e.resumeRecovery();
    assert.equal(await Promise.race([reviewing.then(() => 'settled'), Promise.resolve('waiting')]), 'waiting');
    assert.equal(e.deferredCount(), 1);
    release(); h.setGate(null); await syncing;
    assert.equal(await reviewing, true);
    assert.equal(e.conflicts.length, 1); assert.equal(e.deferredCount(), 0);
  } finally { h.stop(); }
});


test('new records reach server even when continuation cannot persist locally', async () => {
  const initial = { reports: [], dogs: [{ id: 'dog', name: 'Original' }] };
  const h = harness(initial);
  try {
    const e = h.create(); h.external({ ...initial, dogs: [{ id: 'dog', name: 'Server' }] });
    e.stage({ ...initial, dogs: [{ id: 'dog', name: 'Phone' }] }); await e.flush();
    h.setQuota(true); assert.equal(await e.deferRecovery(), true);
    e.stage({ ...e.local, reports: [{ id: 'new', notes: 'Still usable' }] }); await e.flush();
    assert.equal((h.remote().reports as any[])[0].id, 'new');
    assert.equal((h.remote().dogs as any[])[0].name, 'Server');
    assert.equal(e.deferredCount(), 1);
    assert.equal((e.envelope().deferred![0].local.dogs as any[])[0].name, 'Phone');
  } finally { h.stop(); }
});
