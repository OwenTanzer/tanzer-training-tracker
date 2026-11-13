import { useState } from 'react';
import { deferSyncRecovery, resumeSyncRecovery, useDeferredRecoveryCount, getSyncRecoveryBackup, resolveSyncConflict, retrySync, useSyncConflicts, useSyncStatus } from '../data/store';
import { downloadSyncRecovery } from '../lib/syncRecoveryBackup';
import type { Conflict } from '../lib/sync';

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
  const status = useSyncStatus();
  const [choice, setChoice] = useState<{ side: 'local' | 'remote'; conflict: Conflict } | null>(null);
  const [message, setMessage] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const conflict = conflicts[0];
  if (!conflict) return null;
  const currentChoice = choice?.conflict === conflict ? choice.side : null;
  const deviceRecovery = conflict.source === 'device';
  return <main className="mx-auto max-w-2xl space-y-4 p-4">
    <h1 className="text-xl font-semibold">Your changes need attention</h1>
    <section className="space-y-2 rounded border border-sky-300 p-3">
      <button disabled={continuing || backupBusy} className="rounded bg-sky-600 px-4 py-3 font-medium text-white disabled:opacity-50" onClick={async () => {
        setContinuing(true);
        const continued = await deferSyncRecovery();
        if (!continued) setMessage('Could not set these changes aside yet. Check your connection and available device storage, then try again.');
        setContinuing(false);
      }}>{continuing ? 'Opening app…' : 'Continue to app'}</button>
      <p className="text-sm">Use the latest server data now. Earlier pending changes will stay on this device for later review. New work can save normally. You do not need to download a backup or choose a version first.</p>
    </section>
    <p>{deviceRecovery ? 'An earlier page and another tab saved different pending changes. Review both versions before choosing. Neither version is a server confirmation.' : 'This record changed in two different ways. Review both versions before choosing.'}</p>
    {status === 'storage-error' ? <p role="alert" className="rounded border border-amber-500 p-3">This device could not store the latest changes. Keep this page open. Download a recovery backup before leaving; closing or reloading can lose memory-only edits. A choice that cannot be stored will keep both versions open.</p> : <p>These earlier changes are not synced. Continue to the app now, or review the versions below. A recovery backup is optional; unfinished drafts may exist only in this open page.</p>}
    <section aria-label="Recovery backup" className="space-y-2 rounded border p-3 text-sm">
      <p>The backup includes this account’s pending edits, both conflicting versions and unfinished log drafts with their selected pictures. Keep it private. It does not save or sync changes in the app.</p>
      <button className="rounded border px-3 py-2" disabled={backupBusy} onClick={async () => { setBackupBusy(true); setMessage('Preparing the recovery file. Keep this page open; no backup is confirmed yet.'); try { downloadSyncRecovery(await getSyncRecoveryBackup()); setMessage('Download requested. Check that the file exists and opens before relying on it. A cancelled or blocked download leaves no backup. Download again after changes.'); } catch { setMessage('Could not prepare the complete backup. Keep this page open and retry. Nothing has been cleared.'); } finally { setBackupBusy(false); } }}>Download recovery backup</button>
      {message && <p role="status">{message}</p>}
    </section>
    <button disabled={retrying} className="rounded border px-3 py-2" onClick={() => { setRetrying(true); void retrySync().finally(() => setRetrying(false)); }}>Retry recovery</button>
    <p className="font-medium">{versionLabel(conflict.local ?? conflict.remote)} · {conflicts.length} remaining</p>
    {conflict.deletionBlocked && <p>New or changed records still depend on this item. Keep it here so those records remain accessible; you can review and remove them in the app afterward.</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      {(['local', 'remote'] as const).map(side => <section key={side} className="min-w-0 rounded-xl border p-3">
        <h2 className="mb-3 font-semibold">{deviceRecovery ? (side === 'local' ? 'Earlier page’s version' : 'Other tab’s saved version') : (side === 'local' ? 'This device’s version' : 'Server version')}</h2>
        <div className="max-h-72 overflow-auto"><Version value={conflict[side]} /></div>
        <button disabled={conflict.deletionBlocked && conflict[side] === undefined} onClick={() => setChoice({ side, conflict })} className="mt-3 rounded bg-sky-600 px-3 py-2 text-white">Use this version</button>
      </section>)}
    </div>
    {choice && !currentChoice && <p role="status">The versions changed. Review them again before choosing.</p>}
    {currentChoice && <div className="space-y-2 rounded border p-3">
      <p>Keep {deviceRecovery ? (currentChoice === 'local' ? 'the earlier page’s' : 'the other tab’s saved') : (currentChoice === 'local' ? 'this device’s' : 'the server')} version? The competing version will not be used for this record.</p>
      <button className="rounded bg-sky-600 px-3 py-2 text-white" onClick={() => { const stored = resolveSyncConflict(0, currentChoice, conflict); setChoice(null); if (!stored) setMessage('The choice was not stored. Both versions remain available; keep this page open, download a backup and retry recovery.'); }}>Confirm choice</button>
      <button className="ml-3 px-3 py-2" onClick={() => setChoice(null)}>Cancel</button>
    </div>}
    <p className="text-sm text-gray-500">Do not clear this app’s browser data. A backup needs review for recovery; no automatic import is provided.</p>
  </main>;
}
export function SyncIndicator() {
  const status = useSyncStatus();
  const deferred = useDeferredRecoveryCount();
  const labels = {
    idle: '', synced: 'Saved to server', syncing: 'Syncing…', pending: 'Saved on this device · awaiting sync',
    conflict: 'Changes need attention', 'storage-error': 'Not saved on this device · keep this page open', auth: 'Sign in to sync saved changes',
  };
  return <div role="status" className="min-w-0 text-xs">
    <span>{labels[status]}</span>
    {deferred > 0 && <button className="ml-2 underline" onClick={() => resumeSyncRecovery()}>Review earlier changes</button>}
    {['pending', 'storage-error'].includes(status) && <button className="ml-2 underline" onClick={() => void retrySync()}>Retry sync</button>}
  </div>;
}
