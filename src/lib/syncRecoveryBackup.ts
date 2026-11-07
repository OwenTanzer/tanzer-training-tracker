import { copy, equal, type Conflict, type Document, type Envelope } from './sync';
import type { NewLogDraft } from './newLogDraft';

const collections = ['folders', 'dogs', 'reports', 'locations', 'distractionTemplates', 'checklistItems', 'milestoneTemplates', 'completions', 'dogMilestoneCompletions', 'milestoneOutcomeAttempts', 'dogEvents', 'pinnedFolderId'];
const records = (value: unknown): Document[] => Array.isArray(value) ? value.filter(x => x && typeof x === 'object' && typeof x.id === 'string') : [];
export function syncRecoveryBackup(owner: string, envelope: Envelope, remote: Document, conflicts: Conflict[], drafts: { draft: NewLogDraft; memoryOnly: boolean }[]) {
  const changes: { collection: string; id?: string; before: unknown; after: unknown; deleted: boolean }[] = [];
  for (const collection of collections) {
    const before = envelope.base[collection], after = envelope.local[collection];
    if (equal(before, after)) continue;
    if (Array.isArray(before) && Array.isArray(after)) {
      const b = new Map(records(before).map(r => [String(r.id), r])), a = new Map(records(after).map(r => [String(r.id), r]));
      for (const id of new Set([...b.keys(), ...a.keys()])) if (!equal(b.get(id), a.get(id))) changes.push({ collection, id, before: b.get(id) ?? null, after: a.get(id) ?? null, deleted: !a.has(id) });
    } else changes.push({ collection, before: before ?? null, after: after ?? null, deleted: after === undefined });
  }
  const alternatives = conflicts.map(c => ({ ...copy(c), local: c.local ?? null, remote: c.remote ?? null, localDeleted: c.local === undefined, remoteDeleted: c.remote === undefined }));
  // Include only supporting records referenced by pending changes, versions or drafts.
  const references: Record<string, Document[]> = {};
  const queue: unknown[] = [...changes.flatMap(c => [c.before, c.after]), ...conflicts.flatMap(c => [c.local, c.remote]), ...drafts.map(d => d.draft.report)];
  const links: Record<string, string> = { dogId: 'dogs', folderId: 'folders', parentFolderId: 'folders', locationId: 'locations', checklistItemId: 'checklistItems', milestoneTemplateId: 'milestoneTemplates' };
  while (queue.length) {
    const value = queue.shift();
    if (Array.isArray(value)) { queue.push(...value); continue; }
    if (!value || typeof value !== 'object') continue;
    const record = value as Document;
    const ids: [string, unknown][] = Object.entries(links).map(([field, collection]) => [collection, record[field]]);
    for (const id of Array.isArray(record.skillIds) ? record.skillIds : []) ids.push(['checklistItems', id]);
    for (const id of Array.isArray(record.milestoneIds) ? record.milestoneIds : []) ids.push(['milestoneTemplates', id]);
    for (const d of Array.isArray(record.distractions) ? record.distractions : []) ids.push(['distractionTemplates', d.distractionId]);
    for (const [collection, id] of ids) {
      if (typeof id !== 'string' || references[collection]?.some(r => r.id === id)) continue;
      const found = [envelope.local, remote, envelope.base].flatMap(source => records(source[collection])).find(r => r.id === id);
      if (found) { (references[collection] ??= []).push(found); queue.push(found); }
    }
  }
  return copy({ format: 'training-tracker-sync-recovery', version: 1, capturedAt: new Date().toISOString(), instructorId: owner,
    purpose: 'Pending edits, conflicting versions and unfinished drafts for manual recovery. This file is not device storage or server-sync confirmation; no automatic import.',
    baseRevision: envelope.revision, batchId: envelope.batchId, changes, conflicts: alternatives, drafts, references });
}
export function downloadSyncRecovery(backup: ReturnType<typeof syncRecoveryBackup>) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  try { link.href = url; link.download = 'training-tracker-recovery.json'; document.body.appendChild(link); link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
