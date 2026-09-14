# Durable synchronization (#66)

Each instructor has an atomic localStorage outbox envelope containing the last
confirmed server document (`base`), current local document (`local`), revision,
and batch ID. Their difference encodes pending record additions, updates and
deletions. Existing record IDs survive retry. The compatibility cache is not the
authoritative source after an outbox exists.

A save persists this envelope before acknowledging a local save. Uploads use
immutable snapshots and one in-flight batch. Acknowledging a batch advances only
the confirmed base; newer local edits remain pending. Startup, reconnect,
foregrounding and bounded backoff resume work. Requests have a 20-second deadline
through response-body consumption. Suspended iOS processes resume work when the
app can execute again; background execution is not assumed.

Every retry fetches and compares server/base/local. Equal results acknowledge a
previously successful write even if its response was lost. Independent record
changes merge; incompatible changes to the same record require a choice. Progress
records use their dog/skill or dog/milestone identity to prevent duplicate logical
rows. Legacy duplicate rows take the conservative whole-collection conflict path.
References prevent deleting parents of retained records. A parent needed by new
or changed records must be kept during recovery, then reviewed through ordinary
app deletion. Conflicting folder moves cannot silently create cycles.

Conflict candidates are rebuilt if asynchronous form work finishes while a
conflict is displayed. The original base/local versions remain durable until all
choices are made. Partial choices may need to be repeated after closing the app.
The screen does not overwrite a saved record merely because it was fetched later.

Data requests pin the authenticated token; a changed token pauses that account's
queue. Storage events invalidate an obsolete tab session without clearing the new
tab's credentials. Web Locks allow only one editing tab per account and storage
origin. Browsers without Web Locks show an update-browser message instead of
silently sharing an unsafe outbox. Session generations guard stale asynchronous
callbacks. Imports join the queue; transfers flush first and reconcile afterward.

The Worker requires `expectedUpdatedAt` and uses opaque unique revisions, including
transfer writes. Old timestamp revisions remain valid as inputs; no schema change
is required. Frontend and backend can deploy in either order, but open old clients
must reload to receive the durable queue. The old client can still lose its own
unsynced changes until refreshed.

Old caches do not distinguish pending data from confirmed snapshots. On first
upgrade, preserve their content and reconcile conservatively, without inferring
deletions from missing records. Do not clear browser data to bypass recovery.

Storage failure remains a real failure: show that changes are not saved on this
device, retain memory/form state, and allow server delivery. Clearing browser data,
reinstalling the app, or OS eviction can remove local-only data; only a server
acknowledgement is called “Saved to server.”

Validation includes real store and Worker boundaries: offline/relaunch, interrupted
uploads, missing acknowledgements, account changes, form retries, privacy, conflicts,
relationships, progress identities and overlapping startup locks. Phone interaction
checks remain outstanding. Investigating/recovering the historical Hubble log is
separate from preventing future loss.
