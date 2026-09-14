import { useState } from 'react';
import { resolveSyncConflict, retrySync, useSyncConflicts, useSyncStatus } from '../data/store';

function versionLabel(value: unknown): string {
  if (value === undefined) return 'Deleted';
  if (value === null || typeof value !== 'object') return String(value);
  const record = value as Record<string, unknown>;
  return String(record.name ?? record.title ?? record.sessionDate ?? record.notes ?? 'Saved record');
}
function Version({ value }: { value: unknown }) {
  if (value === undefined) return <p>This version deletes the record.</p>;
  if (value === null || typeof value !== 'object') return <p>{String(value)}</p>;
  return <dl className="space-y-2 text-sm">
    {Object.entries(value).filter(([key]) => key !== 'id').map(([key, v]) => <div key={key}>
      <dt className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</dt>
      <dd className="whitespace-pre-wrap break-words">{v === null ? 'None' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v)}</dd>
    </div>)}
  </dl>;
}
export function SyncRecovery() {
  const conflicts = useSyncConflicts();
  const [choice, setChoice] = useState<'local' | 'remote' | null>(null);
  const conflict = conflicts[0];
  if (!conflict) return null;
  return <main className="mx-auto max-w-2xl space-y-4 p-4">
    <h1 className="text-xl font-semibold">Your changes need attention</h1>
    <p>This record changed in two different ways. Both versions are retained until you choose. Other pending changes are also preserved.</p>
    <p className="font-medium">{versionLabel(conflict.local ?? conflict.remote)} · {conflicts.length} remaining</p>
    {conflict.deletionBlocked && <p>New or changed records still depend on this item. Keep it here so those records remain accessible; you can review and remove them in the app afterward.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      {(['local', 'remote'] as const).map(side => <section key={side} className="min-w-0 rounded-xl border p-3">
        <h2 className="mb-3 font-semibold">{side === 'local' ? 'This device’s version' : 'Server version'}</h2>
        <div className="max-h-72 overflow-auto"><Version value={conflict[side]} /></div>
        <button disabled={conflict.deletionBlocked && conflict[side] === undefined} onClick={() => setChoice(side)} className="mt-3 rounded bg-sky-600 px-3 py-2 text-white">Use this version</button>
      </section>)}
    </div>
    {choice && <div className="space-y-2 rounded border p-3">
      <p>Keep {choice === 'local' ? 'this device’s' : 'the server'} version? The competing version will not be used for this record.</p>
      <button className="rounded bg-sky-600 px-3 py-2 text-white" onClick={() => { resolveSyncConflict(0, choice); setChoice(null); }}>Confirm choice</button>
      <button className="ml-3 px-3 py-2" onClick={() => setChoice(null)}>Cancel</button>
    </div>}
    <p className="text-sm text-gray-500">You can leave this page and decide later. Do not clear this app’s browser data.</p>
  </main>;
}
export function SyncIndicator() {
  const status = useSyncStatus();
  const labels = {
    idle: '', synced: 'Saved to server', syncing: 'Syncing…', pending: 'Saved on this device · awaiting sync',
    conflict: 'Changes need attention', 'storage-error': 'Not saved on this device · keep this page open', auth: 'Sign in to sync saved changes',
  };
  return <div role="status" className="min-w-0 text-xs">
    <span>{labels[status]}</span>
    {['pending', 'storage-error'].includes(status) && <button className="ml-2 underline" onClick={() => void retrySync()}>Retry sync</button>}
  </div>;
}
