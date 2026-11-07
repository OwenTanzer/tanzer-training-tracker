import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
test('recovery payload contains exact changed/deleted versions and linked context only, without mutation', async () => {
 const vite = await createServer({ server: { middlewareMode: true, hmr: false, ws: false } });
 try {
 const { syncRecoveryBackup } = await vite.ssrLoadModule('/src/lib/syncRecoveryBackup.ts');
 const dog = { id: 'd', name: 'Synthetic' }, unchanged = { id: 'unrelated', notes: 'PRIVATE UNRELATED' };
 const base = { dogs: [dog, { id: 'other', name: 'OTHER DOG' }], reports: [{ id: 'r', dogId: 'd', notes: 'base' }, unchanged], session: { token: 'SECRET' } };
 const local = { ...base, reports: [{ id: 'r', dogId: 'd', notes: 'local' }, unchanged, { id: 'new', dogId: 'd', notes: 'new' }] };
 const envelope = { base, local, revision: 'rev', batchId: 'batch' }, conflicts = [{ collection: 'reports', id: 'r', local: local.reports[0], remote: undefined }];
 const drafts = [{ memoryOnly: true, draft: { report: { id: 'draft', dogId: 'd', notes: 'unfinished' }, pictureFile: { dataUrl: 'data:image/png;base64,cGhvdG8=' } } }];
 const before = JSON.stringify({ envelope, conflicts, drafts }); const backup = syncRecoveryBackup('owner', envelope, base, conflicts, drafts);
 assert.deepEqual(backup.changes.map((x: any) => x.id), ['r', 'new']); assert.deepEqual(backup.changes[0].after, local.reports[0]); assert.deepEqual(backup.references.dogs, [dog]); assert.deepEqual(backup.drafts, drafts); assert.equal(backup.conflicts[0].remoteDeleted, true); assert.equal(backup.conflicts[0].remote, null);
 assert.equal(JSON.stringify(backup).includes('SECRET'), false); assert.equal(JSON.stringify(backup).includes('UNRELATED'), false); assert.equal(JSON.stringify(backup).includes('OTHER DOG'), false); assert.equal(JSON.stringify({ envelope, conflicts, drafts }), before);
 local.reports[0].notes = 'later'; assert.equal(backup.changes[0].after.notes, 'local');
 } finally { await vite.close(); }
});
