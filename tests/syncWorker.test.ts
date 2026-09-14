import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';
let vite: Awaited<ReturnType<typeof createServer>>;
let worker: typeof import('../worker/src/index.ts').default;
before(async () => {
  vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false } });
  worker = (await vite.ssrLoadModule('/worker/src/index.ts')).default;
});
after(async () => { await vite.close(); });

test('actual Worker rejects missing/stale revisions and issues unique revisions for accepted writes', async () => {
  let row = { blob: '{}', revision: 'original' }, updates = 0;
  const env = { ALLOWED_ORIGINS: '*', DB: { prepare(sql: string) {
    let params: unknown[];
    return { bind(...values: unknown[]) { params = values; return this; },
      async first() { if (sql.includes('FROM sessions')) return { instructor_id: 'abby', expires_at: '2099-01-01' }; throw new Error(sql); },
      async run() {
        assert.match(sql, /WHERE instructor_id = \? AND updated_at = \?/);
        if (params[3] !== row.revision) return { meta: { changes: 0 } };
        row = { blob: params[0] as string, revision: params[1] as string }; updates++; return { meta: { changes: 1 } };
      },
    };
  } } } as unknown as Parameters<typeof worker.fetch>[1];
  const put = (expectedUpdatedAt?: string) => worker.fetch(new Request('https://test.invalid/api/data', {
    method: 'PUT', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' }, body: JSON.stringify({ blob: { reports: [{ id: 'one' }] }, expectedUpdatedAt }),
  }), env);
  assert.equal((await put()).status, 428); assert.equal(updates, 0);
  assert.equal((await put('original')).status, 200); const first = row.revision;
  assert.notEqual(first, 'original');
  assert.equal((await put('original')).status, 409); assert.equal(updates, 1);
  assert.equal((await put(first)).status, 200); assert.notEqual(first, row.revision);
  assert.deepEqual(JSON.parse(row.blob).reports, [{ id: 'one' }]);
});
