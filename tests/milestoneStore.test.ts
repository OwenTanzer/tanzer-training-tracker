import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

// Load the real store through Vite so its browser imports and env handling are
// identical to the app. Only storage and the account API boundary are mocked.
const storage = new Map<string, string>();
let failCache = false;
let uploadedBlob: import('../src/data/db.ts').Database | undefined;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (failCache && (key.includes('server-cache') || key.includes('outbox'))) throw new Error('QuotaExceededError');
    storage.set(key, value);
  },
  removeItem: (key: string) => storage.delete(key),
} });
let server: Awaited<ReturnType<typeof createServer>>;
let store: typeof import('../src/data/store.ts');
let database: typeof import('../src/data/db.ts');
let remoteBlob: unknown;
const originalFetch = globalThis.fetch;
const cache = () => JSON.parse(storage.get('abbys-dog-chej:server-cache:test')!).blob;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

before(async () => {
  globalThis.fetch = async (_url, options) => {
    if (options?.method === 'PUT') {
      uploadedBlob = JSON.parse(options.body as string).blob;
      remoteBlob = uploadedBlob;
      return new Response(JSON.stringify({ updatedAt: 'test-revision' }), { status: 200 });
    }
    return new Response(JSON.stringify({ blob: remoteBlob, updatedAt: 'test-revision', sharedReports: [] }), { status: 200 });
  };
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false },
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('https://test.invalid') } });
  store = await server.ssrLoadModule('/src/data/store.ts') as typeof store;
  database = await server.ssrLoadModule('/src/data/db.ts') as typeof database;
});
after(async () => { await tick(); await server?.close(); globalThis.fetch = originalFetch; });

async function setup() {
  store.resetLocalStore();
  storage.clear();
  remoteBlob = database.emptyDatabase();
  await store.hydrateFromServer('test');
  const dog = store.createDog('Test Dog', 'folder');
  const milestone = store.createMilestoneTemplate('Phase 3', 'Running Guide Evaluation');
  store.saveMilestoneOutcomeOptions(milestone.id, [
    { id: 'accepted', label: 'Accepted', completesMilestone: true },
    { id: 'declined', label: 'Declined', completesMilestone: false },
    { id: 'Fail', label: 'Fail/Release', completesMilestone: false },
  ]);
  store.toggleMilestoneFinalOutcomeFlag(milestone.id);
  return { dog, milestone };
}

test('actual single and repeatable recording never releases, graduates, or reactivates a dog', async () => {
  const { dog, milestone } = await setup();
  milestone.isTerminalOutcomeMilestone = true; // Legacy configuration is not a release instruction.
  for (const outcome of ['declined', 'Fail', 'accepted', null]) {
    assert.equal(store.setMilestoneOutcome(dog.id, milestone.id, outcome), true);
    assert.equal(dog.released, false);
    assert.equal(dog.releasedDate, null);
    assert.equal(dog.graduated, false);
  }
  store.toggleMilestoneRepeatable(milestone.id);
  assert.equal(store.recordMilestoneOutcomeAttempt(dog.id, milestone.id, 'declined').applied, true);
  store.releaseDog(dog.id);
  const releaseDate = dog.releasedDate;
  assert.equal(store.recordMilestoneOutcomeAttempt(dog.id, milestone.id, 'accepted').applied, true);
  store.deleteMostRecentMilestoneAttempt(dog.id, milestone.id);
  store.toggleMilestoneFinalOutcomeFlag(milestone.id);
  assert.equal(dog.released, true);
  assert.equal(dog.releasedDate, releaseDate);
  assert.equal(dog.releasedByTerminalOutcome, false);
  await tick();
});

test('rename/remove/reload and undo retain original attempt labels, semantics, notes, and dates', async () => {
  const { dog, milestone } = await setup();
  store.toggleMilestoneRepeatable(milestone.id);
  store.recordMilestoneOutcomeAttempt(dog.id, milestone.id, 'accepted', 'first evaluation');
  const first = cache().milestoneOutcomeAttempts[0];
  store.saveMilestoneOutcomeOptions(milestone.id, [{ id: 'accepted', label: 'Pending again', completesMilestone: false }]);
  store.recordMilestoneOutcomeAttempt(dog.id, milestone.id, 'accepted', 'retake');
  store.saveMilestoneOutcomeOptions(milestone.id, []);
  await tick();
  remoteBlob = cache();
  store.resetLocalStore();
  await store.hydrateFromServer('test');
  assert.equal(store.recordMilestoneOutcomeAttempt(dog.id, milestone.id, 'accepted').applied, false);
  store.deleteMostRecentMilestoneAttempt(dog.id, milestone.id);
  const state = cache();
  const result = state.dogMilestoneCompletions.find((c: { dogId: string }) => c.dogId === dog.id);
  assert.equal(result.outcomeLabel, 'Accepted');
  assert.equal(result.completed, true);
  assert.equal(result.dateCompleted, first.attemptDate);
  assert.equal(state.milestoneOutcomeAttempts[0].notes, 'first evaluation');
  assert.equal(state.milestoneOutcomeAttempts.length, 1);
  assert.deepEqual(state.milestoneTemplates.find((m: { id: string }) => m.id === milestone.id).allowedOutcomes, []);
  await tick();
});

test('legacy normalization never infers release provenance or a missing decision', async () => {
  const { dog, milestone } = await setup();
  store.releaseDog(dog.id);
  store.setMilestoneOutcome(dog.id, milestone.id, 'Fail');
  await tick();
  const legacy = cache();
  delete legacy.dogs[0].releasedByTerminalOutcome;
  const template = legacy.milestoneTemplates.find((m: { id: string }) => m.id === milestone.id);
  delete template.outcomeOptions;
  delete template.isTerminalOutcomeMilestone;
  const normalized = database.normalizeDatabase(legacy);
  assert.equal(normalized.dogs[0].released, true);
  assert.equal(normalized.dogs[0].releasedByTerminalOutcome, false);
  assert.equal(normalized.milestoneTemplates.find((m) => m.id === milestone.id)?.isTerminalOutcomeMilestone, false);
  normalized.dogMilestoneCompletions[0].outcome = null;
  normalized.dogMilestoneCompletions[0].completed = true;
  assert.equal(database.normalizeDatabase(normalized as never).dogMilestoneCompletions[0].outcome, null);
});

test('invalid selections and duplicate option names do not write decisions', async () => {
  const { dog, milestone } = await setup();
  assert.equal(store.setMilestoneOutcome(dog.id, milestone.id, 'invented'), false);
  assert.equal(store.setMilestoneOutcome('missing', milestone.id, 'accepted'), false);
  assert.equal(store.saveMilestoneOutcomeOptions(milestone.id, [
    { id: 'a', label: 'Accepted', completesMilestone: true },
    { id: 'b', label: ' accepted ', completesMilestone: false },
  ]), false);
  assert.equal(cache().dogMilestoneCompletions.length, 0);
  await tick();
});

test('rendered settings and charts show custom labels and exact counts', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { MilestoneOutcomeChart } = await server.ssrLoadModule('/src/components/MilestoneOutcomeChart.tsx');
  const { MilestoneOutcomeEditor } = await server.ssrLoadModule('/src/components/MilestoneOutcomeEditor.tsx');
  const { milestone } = await setup();
  const editor = renderToStaticMarkup(React.createElement(MilestoneOutcomeEditor, { milestone }));
  assert.match(editor, /Accepted · Declined · Fail\/Release/);
  assert.match(editor, /Edit outcome choices/);
  const html = renderToStaticMarkup(React.createElement(MilestoneOutcomeChart, { stats: {
    id: 'running', title: 'Running Guide Evaluation', phase: 'Phase 3',
    outcomes: [{ id: 'yes', label: 'Accepted', count: 1 }, { id: 'no', label: 'Declined', count: 1 }],
    evaluated: 2, noOutcome: 3, attempts: 4,
  } }));
  assert.match(html, /Accepted: 1 \(50%\)/);
  assert.match(html, /Declined: 1 \(50%\)/);
  assert.match(html, /2 evaluated · 3 without a recorded outcome/);
  assert.doesNotMatch(html, /Placement Ready/);
});


test('quota failure reports an applied attempt and retries the same event without duplicating it', async () => {
  const { dog, milestone } = await setup();
  store.toggleMilestoneRepeatable(milestone.id);
  await tick();
  failCache = true;
  try {
    const first = store.recordMilestoneOutcomeAttempt(dog.id, milestone.id, 'accepted', 'one evaluation', 'event-1');
    assert.deepEqual(first, { applied: true, cached: false, attemptId: 'event-1' });
    await tick();
    assert.equal(uploadedBlob!.milestoneOutcomeAttempts.length, 1);
    const original = structuredClone(uploadedBlob!.milestoneOutcomeAttempts[0]);

    const retry = store.recordMilestoneOutcomeAttempt(dog.id, milestone.id, 'accepted', 'one evaluation', 'event-1');
    assert.deepEqual(retry, first);
    await tick();
    assert.deepEqual(uploadedBlob!.milestoneOutcomeAttempts, [original]);
    assert.deepEqual(store.recordMilestoneOutcomeAttempt(dog.id, milestone.id, 'declined', 'different data', 'event-1'),
      { applied: false, reason: 'conflict' });

    failCache = false;
    const cacheRetry = store.recordMilestoneOutcomeAttempt(dog.id, milestone.id, 'accepted', 'one evaluation', 'event-1');
    assert.deepEqual(cacheRetry, { applied: true, cached: true, attemptId: 'event-1' });
    assert.equal(cache().milestoneOutcomeAttempts.length, 1);
    // A genuinely new evaluation, even with identical content, is still allowed.
    assert.equal(store.recordMilestoneOutcomeAttempt(dog.id, milestone.id, 'accepted', 'one evaluation', 'event-2').applied, true);
    await tick();
    assert.equal(uploadedBlob!.milestoneOutcomeAttempts.length, 2);
  } finally {
    failCache = false;
    await tick();
  }
});

test('single-decision selector keeps the recorded label after rename and permits an explicit new decision', async () => {
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { MilestoneOutcomeSelect } = await server.ssrLoadModule('/src/components/MilestoneOutcomeSelect.tsx');
  const { dog, milestone } = await setup();
  store.setMilestoneOutcome(dog.id, milestone.id, 'accepted');
  store.saveMilestoneOutcomeOptions(milestone.id, [{ id: 'accepted', label: 'Pending again', completesMilestone: false }]);
  const completion = cache().dogMilestoneCompletions[0];
  const html = renderToStaticMarkup(React.createElement(MilestoneOutcomeSelect, { milestone, completion, onChange: () => {} }));
  assert.match(html, /<option[^>]*value="recorded"[^>]*selected=""[^>]*>Accepted \(recorded\)/);
  assert.match(html, /<option value="option:accepted">Pending again<\/option>/);
  assert.doesNotMatch(html, /value="option:accepted"[^>]*selected/);
  store.setMilestoneOutcome(dog.id, milestone.id, 'accepted');
  assert.equal(cache().dogMilestoneCompletions[0].outcomeLabel, 'Pending again');
  assert.equal(cache().dogMilestoneCompletions[0].completed, false);
  await tick();
});
