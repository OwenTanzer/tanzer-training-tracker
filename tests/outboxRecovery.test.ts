import test from 'node:test';
import assert from 'node:assert/strict';
import { SyncEngine, copy, type Envelope, type SyncIO } from '../src/lib/sync.ts';
const base = { reports: [{ id: 'same', notes: 'base' }] };
function harness(envelope: Envelope, failAt = Infinity) {
  let writes = 0, saved: Envelope | null = null;
  const io: SyncIO = {
    read: async () => { throw Object.assign(Error('offline'), { status: 401 }); },
    write: async () => { throw Error('no upload expected'); },
    persist: value => { writes++; if (writes >= failAt) return false; saved = copy(value); return true; },
    changed() {}, diagnostic() {},
  };
  const engine = new SyncEngine(io, envelope);
  return { engine, saved: () => saved };
}
test('delete versus newer edit needs choice and both branches survive serialization', () => {
  const envelope = { base, local: { reports: [{ id: 'same', notes: 'B edited' }] },
    revision: '1', batchId: 'b', recoveries: [{ base, local: { reports: [] } }] };
  const { engine, saved } = harness(envelope);
  assert.equal(engine.recover(), false);
  assert.equal(engine.conflicts[0].local, undefined);
  assert.deepEqual(engine.conflicts[0].remote, { id: 'same', notes: 'B edited' });
  const cold = harness(saved()!).engine;
  assert.equal(cold.recover(), false);
  assert.equal(cold.conflicts[0].source, 'device');
  engine.stop(); cold.stop();
});
test('failure on final choice write restores the queued branch and competing versions', () => {
  const envelope = { base, local: { reports: [{ id: 'same', notes: 'B' }] },
    revision: '1', batchId: 'b', recoveries: [{ base, local: { reports: [{ id: 'same', notes: 'A' }] } }] };
  const { engine } = harness(envelope, 3);
  engine.recover();
  const before = copy(engine.envelope());
  assert.equal(engine.resolve(0, 'local'), false);
  assert.deepEqual(engine.envelope(), before);
  assert.equal(engine.conflicts.length, 1);
  assert.equal(engine.status, 'storage-error');
  engine.stop();
});
test('several retained page branches are resolved sequentially without discarding independent additions', () => {
  const envelope = { base, local: { reports: [{ id: 'same', notes: 'B' }, { id: 'b', notes: 'B only' }] },
    revision: '1', batchId: 'b', recoveries: [
      { base, local: { reports: [{ id: 'same', notes: 'A' }, { id: 'a', notes: 'A only' }] } },
      { base, local: { reports: [{ id: 'same', notes: 'C' }, { id: 'c', notes: 'C only' }] } },
    ] };
  const { engine } = harness(envelope);
  engine.recover();
  assert.equal(engine.resolve(0, 'local'), true);
  assert.equal(engine.conflicts.length, 1);
  assert.equal(engine.envelope().recoveries?.length, 1);
  assert.equal(engine.resolve(0, 'remote'), true);
  assert.deepEqual((engine.local.reports as {id:string}[]).map(r => r.id).sort(), ['a','b','c','same']);
  assert.equal(engine.envelope().recoveries, undefined);
  engine.stop();
});
