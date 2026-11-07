import type { TrainingReport } from '../types';
import { readBackupPicture } from './logBackup.ts';

export interface NewLogDraft {
  version: 1;
  savedAt: string;
  report: TrainingReport;
  newLocationName: string;
  pictureFile: Awaited<ReturnType<typeof readBackupPicture>> | null;
}
export function draftKey(owner: string, dogId: string) {
  return `ttt:log-draft:${encodeURIComponent(owner)}:${encodeURIComponent(dogId)}`;
}
// A failed device write must survive an in-page login transition. This is
// deliberately not a persistence receipt: closing the page still loses it.
const memoryDrafts = new Map<string, NewLogDraft>();
// Compare against the durable bytes this page last observed, never a clock.
const volatileBases = new Map<string, string | null | undefined>();
function durableBytes(key: string) { try { return localStorage.getItem(key); } catch { return undefined; } }
export function isDraftStale(owner: string, dogId: string) {
  const key = draftKey(owner, dogId);
  return volatileBases.has(key) && (volatileBases.get(key) === undefined || durableBytes(key) !== volatileBases.get(key));
}
export function discardVolatileDraft(owner: string, dogId: string) {
  const key = draftKey(owner, dogId);
  memoryDrafts.delete(key); preparingDrafts.delete(key); volatileBases.delete(key);
}
const preparingDrafts = new Map<string, { draft: NewLogDraft; file: File | null }>();
export function retainPreparingDraft(owner: string, dogId: string, draft: NewLogDraft, file: File | null) {
  const key = draftKey(owner, dogId);
  if (!volatileBases.has(key)) volatileBases.set(key, durableBytes(key));
  preparingDrafts.set(key, { draft: structuredClone(draft), file });
}
export async function prepareRecoveryDrafts(owner: string) {
  const prefix = draftKey(owner, '');
  const keys = new Set([...Object.keys(localStorage), ...memoryDrafts.keys(), ...preparingDrafts.keys()].filter(key => key.startsWith(prefix)));
  return Promise.all([...keys].map(async key => {
    const loaded = loadNewLogDraft(owner, decodeURIComponent(key.slice(prefix.length)));
    if (loaded.blocked || !loaded.draft) throw new Error('A device draft could not be read.');
    const draft = loaded.draft;
    if (loaded.selectedFile) draft.pictureFile = await readBackupPicture(loaded.selectedFile);
    return { draft, memoryOnly: loaded.memoryOnly ?? false };
  }));
}
export function hasMemoryDraftRecovery() { return memoryDrafts.size > 0 || preparingDrafts.size > 0; }
export function getRecoveryDrafts(owner: string) {
  const prefix = draftKey(owner, '');
  const keys = new Set([...Object.keys(localStorage), ...memoryDrafts.keys(), ...preparingDrafts.keys()].filter(key => key.startsWith(prefix)));
  return [...keys].map(key => {
    const loaded = loadNewLogDraft(owner, decodeURIComponent(key.slice(prefix.length)));
    if (loaded.blocked || !loaded.draft || loaded.selectedFile) throw new Error('A device draft could not be read.');
    return { draft: loaded.draft, memoryOnly: loaded.memoryOnly ?? false };
  });
}
export function loadNewLogDraft(owner: string | null, dogId: string | undefined): { draft: NewLogDraft | null; blocked: boolean; memoryOnly?: boolean; selectedFile?: File | null; stale?: boolean; deviceDraftMissing?: boolean } {
  if (!owner || !dogId) return { draft: null, blocked: true };
  const preparing = preparingDrafts.get(draftKey(owner, dogId));
  const memory = preparing?.draft ?? memoryDrafts.get(draftKey(owner, dogId));
  try {
    const text = memory ? null : localStorage.getItem(draftKey(owner, dogId));
    if (!memory && !text) return { draft: null, blocked: false };
    const d = memory ? structuredClone(memory) : JSON.parse(text!) as NewLogDraft;
    const r = d.report;
    if (d.version !== 1 || !r || r.authorInstructorId !== owner || r.dogId !== dogId ||
      typeof r.id !== 'string' || !r.id || typeof r.notes !== 'string' || typeof r.sessionDate !== 'string' ||
      typeof r.createdDate !== 'string' || typeof r.updatedDate !== 'string' ||
      (r.picture !== null && typeof r.picture !== 'string') || (r.locationId !== null && typeof r.locationId !== 'string') ||
      typeof r.phase !== 'string' || typeof r.redFlag !== 'boolean' ||
      ![r.skillIds, r.milestoneIds].every(a => Array.isArray(a) && a.every(x => typeof x === 'string')) ||
      !Array.isArray(r.distractions) || !r.distractions.every(x => typeof x.distractionId === 'string' && typeof x.severity === 'string') ||
      typeof d.newLocationName !== 'string' || typeof d.savedAt !== 'string' ||
      (d.pictureFile !== null && (typeof d.pictureFile?.name !== 'string' || typeof d.pictureFile?.type !== 'string' ||
        typeof d.pictureFile?.dataUrl !== 'string' || !d.pictureFile.dataUrl.startsWith('data:image/') || !d.pictureFile.dataUrl.includes(';base64,')))) {
      throw new Error('Invalid draft');
    }
    return { draft: d, blocked: false, ...(memory ? { memoryOnly: true } : {}), ...(preparing ? { selectedFile: preparing.file } : {}), ...(memory && isDraftStale(owner, dogId) ? { stale: true, deviceDraftMissing: durableBytes(draftKey(owner, dogId)) === null } : {}) };
  } catch { return { draft: null, blocked: true }; }
}
export function restoreDraftPicture(picture: NewLogDraft['pictureFile']): File | null {
  if (!picture) return null;
  const bytes = Uint8Array.from(atob(picture.dataUrl.split(',')[1]), c => c.charCodeAt(0));
  return new File([bytes], picture.name, { type: picture.type });
}
export function saveNewLogDraft(owner: string, dogId: string, draft: NewLogDraft): boolean {
  const key = draftKey(owner, dogId);
  if (isDraftStale(owner, dogId)) return false;
  if (!volatileBases.has(key)) volatileBases.set(key, durableBytes(key));
  preparingDrafts.delete(key);
  try { localStorage.setItem(key, JSON.stringify(draft)); memoryDrafts.delete(key); volatileBases.delete(key); return true; }
  catch { memoryDrafts.set(key, structuredClone(draft)); return false; }
}
export function clearNewLogDraft(owner: string, dogId: string): boolean {
  if (isDraftStale(owner, dogId)) return false;
  try { const key = draftKey(owner, dogId); localStorage.removeItem(key); discardVolatileDraft(owner, dogId); return true; }
  catch { return false; }
}
