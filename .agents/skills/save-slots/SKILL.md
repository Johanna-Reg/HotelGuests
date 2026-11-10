---
name: save-slots
version: 1.1.1
tier: optional
description: Save progress with typed slots, immediate write receipts, awaited persistence barriers, backups, migrations and settings. Use when a game needs to save or load local progress, batch saves, confirm browser persistence, handle storage failures or distinguish memory updates from durable native writes.
---

# Save slots and persistence confirmation

Declare a type with `saveData` in the project schema and run `gameengine gen`. Create its
slots with `defineSave(Token, { defaults, migrate })` from `@gameengine/runtime`.

```ts
const progress = defineSave(ProgressSave, { defaults: () => ({ level: 1 }) });
const receipt = progress.writeImmediate({ level: 2 });
// The game can keep running here.
await receipt.accepted;
const result = await progress.flush();
```

`writeImmediate` returns synchronously. On web, the filesystem write has happened in memory;
native platforms queue the file write on their ordered worker. Its `accepted` promise reports
file or validation errors. Always handle it. Receipt rejections are also logged.

Existing `await progress.write(data)` waits for the same engine-write stage. On native
platforms this includes fsync; on web it does not wait for IndexedDB. `await progress.flush()`
confirms earlier accepted writes and deletes across all save types, plus current
`gameengine.kv` settings. Browser confirmation follows a strict IndexedDB transaction;
native confirmation follows the ordered worker. The returned durability is `strict`,
`native`, or `memory` in tests. Batch writes before one barrier instead of flushing each one.

Temporary browser storage rejects barriers with `E_UNAVAILABLE`. Handle `E_QUOTA`, `E_IO`,
`E_ABORTED`, `E_BUSY` and `E_LIMIT`; failed browser transactions remain dirty for an explicit
retry. Do not acknowledge a purchase or describe progress as persisted before the barrier
succeeds. Page exit is too late to start a guaranteed save. Browser persistence cannot
promise protection from eviction or every power loss.

Quota failures stop automatic background retries, including after later writes. Free space
or reduce saved data, then retry explicitly. Older browsers may persist data but reject strict
confirmation with `E_UNAVAILABLE`.
If journal-overflow recovery returns `E_BUSY`, pause mutations while retrying the barrier.

Slots use checksums and retain the previous write as a backup. `load()` reports `fresh`,
`recovered` and the stored version. Migrations run from each earlier version to the current
one; a newer build's save is refused. `delete(slot)` removes both versions, and `slots()`
lists names. Defaults are 8 MiB per encoded save and 32 MiB for batch snapshots and queued
native work. Configure all save types in the game's `project.gameengine.json`:

```json
"storage": { "maxSaveBytes": 33554432, "maxQueuedBytes": 134217728 }
```

Omitting `maxQueuedBytes` chooses the greater of 32 MiB and four times `maxSaveBytes`.
Use positive integer bytes, queue at least 65536 bytes and twice the file limit, and
queue at most 2147483647 bytes. Native queue accounting estimates snapshot memory; web batches count
encoded files including backups. Keep headroom for the save envelope and formatting.
An existing file above a lowered limit returns `E_LIMIT` on reads and replacement writes.
Raise the limit before transforming it; never treat this error as a fresh slot.
Dense arrays and objects may require a queue well above twice their encoded size.
The shared queue also covers settings snapshots. A file below its individual cap can
still exceed a small queue budget. Nesting has a separate native limit of 128. Browser
settings files remain limited to 8 MiB; other user-data files use the queue byte limit. Await earlier native work
after `E_BUSY`. Measure actual saves and device memory before raising budgets.

These APIs are presentation-only. Bring loaded progress into sim as recorded input or a
persisted meta's `MetaLoaded`, so replays agree. Test `writeImmediate`, `flush`, failures and
reload behavior, and run game tests on V8 and Hermes. Memory tests report `memory` and do
not prove browser or device persistence.
