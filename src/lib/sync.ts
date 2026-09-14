// A coalesced outbox: base + local encode additions, changes and deletions.
// Record IDs are stable across retries; a lost acknowledgement is reconciled
// against base instead of replaying a create action with a new ID.
export type Document = Record<string, unknown>;
export type Conflict = { collection: string; id?: string; local: unknown; remote: unknown; deletionBlocked?: boolean; folderMovesOnly?: boolean };
export type Snapshot = { blob: Document; updatedAt: string };
export type Envelope = { base: Document; local: Document; revision: string | null; batchId: string };
export type Status = 'idle' | 'syncing' | 'synced' | 'pending' | 'conflict' | 'storage-error' | 'auth';
export const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  const x = a as Document, y = b as Document;
  return Object.keys(x).length === Object.keys(y).length && Object.keys(x).every(k => Object.hasOwn(y, k) && equal(x[k], y[k]));
}
const records = (v: unknown): v is (Document & { id: string })[] => Array.isArray(v) && v.every(x => x && typeof x.id === 'string') && new Set(v.map(x => x.id)).size === v.length;
function recordKey(collection: string, record: Document & { id: string }): string {
  if (collection === 'completions' && typeof record.dogId === 'string' && typeof record.checklistItemId === 'string') return JSON.stringify([record.dogId, record.checklistItemId]);
  if (collection === 'dogMilestoneCompletions' && typeof record.dogId === 'string' && typeof record.milestoneTemplateId === 'string') return JSON.stringify([record.dogId, record.milestoneTemplateId]);
  return record.id;
}
export function merge(base: Document, local: Document, remote: Document): { blob: Document; conflicts: Conflict[] } {
  const blob: Document = {}, conflicts: Conflict[] = [];
  function choose(b: unknown, l: unknown, r: unknown, collection: string, id?: string) {
    if (equal(l, r) || equal(b, r)) return l;
    if (equal(b, l)) return r;
    conflicts.push({ collection, id, local: l, remote: r });
    return l;
  }
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const b = base[key], l = local[key], r = remote[key];
    const uniqueKeys = (v: unknown) => records(v) && new Set(v.map(x => recordKey(key, x))).size === v.length;
    if (records(b ?? []) && records(l) && records(r) && uniqueKeys(b ?? []) && uniqueKeys(l) && uniqueKeys(r)) {
      const bm = new Map(((b ?? []) as (Document & { id: string })[]).map(x => [recordKey(key, x), x]));
      const lm = new Map(l.map(x => [recordKey(key, x), x])), rm = new Map(r.map(x => [recordKey(key, x), x]));
      blob[key] = [...new Set([...rm.keys(), ...lm.keys(), ...bm.keys()])].flatMap(id => {
        const v = choose(bm.get(id), lm.get(id), rm.get(id), key, id);
        return v === undefined ? [] : [v];
      });
    } else {
      const v = choose(b, l, r, key);
      if (v !== undefined) blob[key] = v;
    }
  }
  // Preserve relationships as well as records. A concurrent delete must
  // not hide a log, selected milestone, folder or observation. Iterate since
  // restoring a dog can itself require restoring its folder/ancestors.
  const refs: Record<string, string> = { dogId: 'dogs', folderId: 'folders', parentFolderId: 'folders', pinnedFolderId: 'folders', locationId: 'locations', checklistItemId: 'checklistItems', milestoneTemplateId: 'milestoneTemplates' };
  let restored: boolean;
  do {
    restored = false;
    const all = [blob, ...Object.values(blob).flatMap(values => records(values) ? values : [])];
    for (const record of all) {
      const links: [string, unknown][] = Object.entries(refs).map(([field, collection]) => [collection, record[field]]);
      for (const id of (Array.isArray(record.skillIds) ? record.skillIds : [])) links.push(['checklistItems', id]);
      for (const id of (Array.isArray(record.milestoneIds) ? record.milestoneIds : [])) links.push(['milestoneTemplates', id]);
      for (const observation of (Array.isArray(record.distractions) ? record.distractions : [])) links.push(['distractionTemplates', observation.distractionId]);
      for (const [collection, id] of links) {
        if (typeof id !== 'string') continue;
        const parents = blob[collection];
        if (!records(parents)) continue;
        const existing = conflicts.find(c => c.collection === collection && c.id === id);
        if (existing && (existing.local === undefined || existing.remote === undefined)) existing.deletionBlocked = true;
        if (parents.some(x => x.id === id)) continue;
        const find = (doc: Document) => records(doc[collection]) ? doc[collection].find(x => x.id === id) : undefined;
        const l = find(local), r = find(remote);
        if (!l && !r) continue; // An already-unresolved legacy reference.
        if (!existing) conflicts.push({ collection, id, local: l, remote: r, deletionBlocked: true });
        parents.push(copy(l ?? r!)); restored = true;
      }
    }
  } while (restored);
  // Two individually valid folder moves can together form a cycle. Keep
  // independent additions in both alternatives and ask which set of moves
  // to retain instead of making folders unreachable or looping forever.
  if (records(blob.folders)) {
    const folders = blob.folders;
    const parents = new Map(folders.map(f => [f.id, f.parentFolderId]));
    const cyclic = new Set<string>();
    for (const folder of folders) {
      const chain: string[] = [];
      let id: unknown = folder.id;
      while (typeof id === 'string' && parents.has(id)) {
        const index = chain.indexOf(id);
        if (index >= 0) { chain.slice(index).forEach(k => cyclic.add(k)); break; }
        chain.push(id); id = parents.get(id);
      }
    }
    if (cyclic.size) {
      const alternative = (side: Document) => folders.map(f => {
        const original = records(side.folders) ? side.folders.find(x => x.id === f.id) : undefined;
        return cyclic.has(f.id) && original ? { ...f, parentFolderId: original.parentFolderId } : f;
      });
      conflicts.push({ collection: 'folders', local: alternative(local), remote: alternative(remote), folderMovesOnly: true });
    }
  }
  return { blob, conflicts };
}
export function applyChoice(blob: Document, conflict: Conflict, value: unknown) {
  if (conflict.folderMovesOnly && records(value) && records(blob.folders)) {
    const moves = new Map(value.map(f => [f.id, f.parentFolderId]));
    blob.folders = blob.folders.map(f => moves.has(f.id) ? { ...f, parentFolderId: moves.get(f.id) } : f);
    return;
  }
  if (conflict.id === undefined) {
    if (value === undefined) delete blob[conflict.collection];
    else blob[conflict.collection] = value;
  } else {
    const list = blob[conflict.collection] as (Document & { id: string })[];
    blob[conflict.collection] = [...list.filter(x => recordKey(conflict.collection, x) !== conflict.id), ...(value === undefined ? [] : [value])];
  }
}
export interface SyncIO {
  read(): Promise<Snapshot>;
  write(blob: Document, revision: string): Promise<{ updatedAt: string }>;
  persist(envelope: Envelope): boolean;
  changed(local: Document, status: Status, conflicts: Conflict[]): void;
  diagnostic(event: string, detail: string): void;
}
export class SyncEngine {
  base: Document;
  local: Document;
  revision: string | null;
  batchId: string;
  status: Status = 'idle';
  conflicts: Conflict[] = [];
  private candidate: { blob: Document; remote: Snapshot } | null = null;
  private running: Promise<void> | null = null;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  io: SyncIO;
  constructor(io: SyncIO, envelope: Envelope) {
    this.io = io;
    this.base = copy(envelope.base); this.local = copy(envelope.local);
    this.revision = envelope.revision; this.batchId = envelope.batchId;
  }
  envelope(): Envelope { return { base: this.base, local: this.local, revision: this.revision, batchId: this.batchId }; }
  private emit() { if (!this.stopped) this.io.changed(this.local, this.status, this.conflicts); }
  persist(): boolean {
    const saved = this.io.persist(this.envelope());
    if (!saved) { this.status = 'storage-error'; this.io.diagnostic('Local save failed', 'Pending edits remain in memory. Keep this page open.'); }
    return saved;
  }
  stage(blob: Document): boolean {
    this.local = copy(blob); this.batchId = crypto.randomUUID();
    this.status = this.conflicts.length ? 'conflict' : 'pending';
    const saved = this.persist();
    // Async form/photo work can finish after the conflict screen appears.
    // Rebuild the candidate so resolving a conflict cannot drop that work.
    if (this.candidate) this.reconcile(this.candidate.remote);
    // Keep existing references in the store during an ordinary edit.
    void this.flush();
    return saved;
  }
  reconcile(remote: Snapshot): boolean {
    const result = merge(this.base, this.local, remote.blob);
    if (result.conflicts.length) {
      this.conflicts = result.conflicts; this.candidate = { blob: result.blob, remote };
      this.status = 'conflict'; this.persist(); this.emit();
      this.io.diagnostic('Sync conflict', `${result.conflicts.length} records need a choice; both versions retained.`);
      return false;
    }
    this.base = copy(remote.blob); this.local = copy(result.blob); this.revision = remote.updatedAt;
    this.conflicts = []; this.candidate = null;
    this.status = equal(this.base, this.local) ? 'synced' : 'pending';
    this.persist(); this.emit(); return true;
  }
  resolve(index: number, side: 'local' | 'remote') {
    if (!this.candidate) return;
    const conflict = this.conflicts[index];
    if (!conflict || (conflict.deletionBlocked && conflict[side] === undefined)) return;
    applyChoice(this.candidate.blob, conflict, conflict[side]);
    this.conflicts = this.conflicts.filter((_, i) => i !== index);
    if (this.conflicts.length) { this.emit(); return; }
    this.local = copy(this.candidate.blob); this.base = copy(this.candidate.remote.blob);
    this.revision = this.candidate.remote.updatedAt; this.candidate = null;
    this.batchId = crypto.randomUUID(); this.status = 'pending'; this.persist(); this.emit(); void this.flush();
  }
  async refresh(): Promise<void> {
    if (this.running) await this.running;
    if (this.stopped) return;
    try {
      const remote = await this.io.read();
      if (this.stopped) return;
      if (this.reconcile(remote)) await this.flush();
    } catch (err) { if (!this.stopped) this.failed(err); }
  }
  flush(): Promise<void> {
    if (this.stopped || this.conflicts.length) return Promise.resolve();
    if (this.running) return this.running;
    clearTimeout(this.timer);
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }
  private async run() {
    try {
      // Always reconcile first: this handles lost acknowledgements, fresh
      // sessions, another device, and interrupted prior batches uniformly.
      const remote = await this.io.read();
      if (this.stopped || !this.reconcile(remote)) return;
      while (!this.stopped && !equal(this.base, this.local)) {
        const sent = copy(this.local), batch = this.batchId;
        this.status = 'syncing'; this.emit();
        this.io.diagnostic('Sync started', `batch ${batch}`);
        const response = await this.io.write(sent, this.revision!);
        if (this.stopped) return;
        // Only this immutable snapshot was acknowledged. Newer local edits
        // remain pending and are persisted with the newly confirmed base.
        this.base = sent; this.revision = response.updatedAt;
        this.status = equal(this.base, this.local) ? 'synced' : 'pending';
        this.persist(); this.emit(); this.failures = 0;
        this.io.diagnostic('Sync confirmed', `batch ${batch}; revision ${response.updatedAt}`);
      }
    } catch (err) { if (!this.stopped) this.failed(err); }
  }
  private failed(err: unknown) {
    const code = (err as { status?: number }).status;
    this.status = code === 401 ? 'auth' : 'pending';
    this.persist(); this.emit();
    this.io.diagnostic('Sync pending', `status ${code ?? 'network'}; pending batch ${this.batchId}`);
    if (code !== 401 && code !== 400 && code !== 422 && code !== 428) {
      this.timer = setTimeout(() => void this.flush(), Math.min(60000, 1000 * 2 ** Math.min(this.failures++, 6)));
    }
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }
}
