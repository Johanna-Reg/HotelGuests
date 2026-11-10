---
name: content-database
version: 1.17.0
tier: optional
description: Typed content data and downloadable packs — dataAsset/loadData for levels, items, waves and rewards, and collections (*.collection.json) delivered in-app or on demand. Use when adding levels or content tables, making content designer-editable, or shipping a content pack separately.
---

# Content database: data assets and collections

**Covers:** The game's content database in Game Engine — typed data assets (dataAsset, p.ref, JSON under assets/ with $type, loadData/listData) for levels, items, waves and rewards, and collections (collections/*.collection.json) that group scenes and data with everything they reference into bundles delivered in-app or on demand (collection:<name>, requestCollection). Use when adding levels or tables of content, making content designer-editable, splitting content into downloadable packs, or when a level/content pack must ship separately.

**Data assets** are typed records designers edit (like ScriptableObjects). **Collections** group
content that ships and loads together (like AssetBundles), with their dependencies resolved for you.

## 1. Declare a data type

```ts
// schema/content.schema.ts
import { dataAsset, p } from '@gameengine/schema';

export const LevelDef = dataAsset('LevelDef', {
  title: p.str('Shown in the level list'),
  scene: p.ref('scene', 'The scene this level plays'),
  moves: p.int(),
  target: p.int('Score to win'),
  reward: p.optional(p.ref('RewardDef')),
  tags: p.arr(p.oneOf(['tutorial', 'hard', 'boss'])),
}, { doc: 'One level of the main map.' });
```

`p.ref(to)`: `'scene'` (`scenes/…scene.json`), `'prefab'`, `'asset'` (a key under `assets/`, e.g.
`maze/level2.tilemap.json`), or another data type's name (that asset's key). References are
validated and followed when collections are packed. Run `gameengine gen`.

**Shapes that vary or nest** (Unity's `[SerializeReference]` lists, behaviour trees, dialogue):

```ts
export const EnemyDef = dataAsset('EnemyDef', {
  steps: p.arr(p.union('$type', {                        // one shape per branch, told apart by the tag field
    Follow: { speed: p.num() },
    Wait: { seconds: p.num() },
    Spawn: { prefab: p.ref('prefab') },
  })),
  brain: p.def('Node', p.obj({ name: p.str(), children: p.arr(p.use('Node')) })),   // recursive
});
```

- `p.union(tag, branches)`: each item holds its branch's name in `tag` (`'$type'` is the usual one); the
  generated type is a discriminated union (`switch (s.$type)`), and validation picks the branch by the tag
  and names the failing field (`steps[2].seconds`).
- `p.def(Name, shape)` names a shape (PascalCase) that `p.use(Name)` repeats anywhere in the same data type:
  recursion, or one shape reused; the generated type takes the name.
- `gameengine validate` checks every `p.ref` wherever it sits (inside unions, `p.def` shapes, arrays and
  `p.nullable`) and reports a broken one as `E_DATA_REF` with its field path, whether or not a collection
  packs the file.

## 2. Author data assets

One JSON file per record under `assets/` (any folder; `assets/data/<type>/` keeps them tidy):

```json
{ "$type": "LevelDef", "title": "Sugar Rush", "scene": "scenes/board.scene.json", "moves": 20, "target": 3000, "tags": ["tutorial"] }
```

`gameengine validate` reports missing or unknown fields, wrong types, bad enum values and broken
references per file. Re-run `gameengine gen` after adding or removing data files by hand (it updates
the index `listData` reads); edits to existing files hot-reload. Creating one through the command
bus does both steps for you: `gameengine cmd asset.setText --params '{"path":"assets/data/levels/l3.json","text":"…"}'`
(or an editor mode's `api.execute('asset.setText', …)`) writes the file with its `.gmeta` (a new
GUID) and runs `gameengine gen` (the CLI reports it under `gen`).

## 3. Read them

```ts
import { loadData, listData } from '@gameengine/runtime';
import { Level, LevelDef } from './schema.gen.ts';

const def = loadData(LevelDef, ctx.get(Level).data);   // frozen; throws if the $type differs
for (const key of listData(LevelDef)) { … }           // every level, sorted by key
```

- Sim systems may read data assets: they are content, identical on every device, and replays
  record their hash (a replay that diverges after data changed says `contentChanged`). Never
  write to them (they are frozen); progress goes in meta state.
- **On-demand content and the sim:** whether a download has finished is network timing, which
  the sim must never depend on. Sim code reads only data from in-app collections, or from an
  on-demand collection after UI code has awaited `requestCollection(name)` and told the sim with
  an input or event (e.g. `CollectionReady { name }`) that it then stores in a resource. Reading
  a not-yet-mounted key throws with the bundle's name.
- **Where the bytes come from:** `loadData` never waits on storage during a frame on a device.
  A cooked game reads every in-app data asset (and tilemap) into memory when it starts, up to
  4 MB in all; `loadData` then only parses (once per key; later calls return the cached record).
  A project with more data than that keeps each level's data in the level's asset group
  (`"level-3": { "include": ["assets/data/levels/l3.json", …] }`, skill `asset-memory`): loading
  the group reads it, releasing it drops it. An on-demand bundle's data is read into memory
  when `requestCollection` mounts it (the same 4 MB cap per bundle). A key that is in
  memory neither way is read from storage on the spot: it works, but hitches the frame and logs
  `data asset '…' read from storage on the … thread` once per key — group it.
  `assets.stats().resident.data` is what data holds in memory. Loose dev runs read the files.
- Type what holds a loaded record with the generated `Readonly<Type>Data` (`ReadonlyLevelDefData`,
  `DataRecord<LevelDefData>`): `loadData` returns it frozen all the way down, so it is not
  assignable to the mutable `LevelDefData` (copy fields out if you need to change them).
- **Tunables:** numbers designers tweak while the game runs get a live view instead of constants:
  `export const FarmTuning = defineTunables(FarmTuningDef, 'data/tunables/farm.json')`, then
  `FarmTuning.get().growSeconds` inside a system or view (once per run). It is the shipped asset
  until the file is edited in a dev run: a watcher sends the new content as recorded
  `TunablesChanged` input, and every system sees it from the same step on (replays repeat it,
  rollback restores it); a value copied into a module constant keeps the old one. In a test, raise the
  change with `input.emit(TunablesChanged, { key, value: JSON.stringify(next) })`. Sample
  `samples/meta-hub`.
- Point scenes at their data with an `asset('data')` field on a resource or component
  (`resources: { "Level": { "data": "data/levels/l1.json" } }`) so one board scene serves many levels.
- Keep records small and flat; split a huge table into one file per record so designers don't
  conflict and collections can pick subsets.

## 4. Group content into collections

```json
// collections/world-2.collection.json
{ "doc": "World 2: levels 21–40 and the boss.", "bundle": "world-2", "include": ["assets/data/levels/w2_*.json", "scenes/boss.scene.json"] }
```

`include` takes project paths and globs. `gameengine gen` resolves the **closure**: the items plus
every scene, prefab, data asset and asset file they reference (component asset fields such as
`Sprite.image`, `Tilemap.tileset`, `MeshRenderer.mesh` — `models/x.glb#Part` is the file,
`builtin:plane` no file — fonts, data refs, a `*.mat.json`'s program and textures), recursively.

Deliver it through a bundle group in `project.gameengine.json` — collection groups first, then
the catch-all base. A bundle's `include` decides what ships: a file no bundle includes is left out
of the build (the cook warns and lists it as `unshipped`; `gameengine cook --report` shows them),
so keep a catch-all like `"**"` unless you mean to leave files out:

```json
"bundles": [
  { "name": "world-2", "include": ["collection:world-2"], "delivery": "on-demand" },
  { "name": "base", "include": ["**"], "delivery": "in-app" }
]
```

`exclude` takes files back out of a bundle's `include` (globs or `collection:<name>`): a later
bundle may still take them, and what no bundle takes does not ship — without the unshipped
warning, listed under `excluded` in `gameengine cook --report`. Use it for source art kept only
for baking, debug levels, or anything that must stay in the repo but not in the app:
`{ "name": "base", "include": ["**"], "exclude": ["assets/source/**"] }`.

At run time (UI code, e.g. when the player opens world 2):

```ts
import { collection, requestCollection, requireCollections, loading, services } from '@gameengine/runtime';

await requestCollection('world-2', { priority: 'interactive' }); // the player waits: goes first
const levels = collection('world-2').data.LevelDef;

void requestCollection('world-3');            // prefetch (background, the default)
await requireCollections(['world-2', 'boss-pack']); // gate a feature on several packs
await loading.run({ collections: ['world-2'], load: ['world-2'], swap: 'scenes/w2_01.scene.json' }); // download under the cover, then load
services.bundles.on('progress', (p) => bar.set(p.bytes / p.total)); // your own progress UI
```

Where the bytes come from (`project.gameengine.json` `delivery`, ADR 0109):

```json
"delivery": { "url": "https://cdn.example.com/my-game/{key}", "maxConcurrent": 2, "retries": 3 }
```

- Each on-demand bundle has a content-addressed **key**, `<platform>/<name>-<sha256>.gpak`
  (`gameengine bundles list`). An unchanged bundle keeps its key: it is not uploaded or
  downloaded again, and older app versions keep finding theirs.
- Signed URLs, auth headers or Play Asset Delivery / On-Demand Resources: set
  `"resolver": "<service>.<method>"` to a project service (skill `platform-services`) that answers
  `{ url, headers? }` or `{ path }` for `{ name, key, sha256, bytes, platform }`. The engine still
  checks the hash and keeps the file.
- Downloads stream to disk, are checked against the cooked manifest, retried, and kept in user
  data; kept copies of older builds are deleted. `services.bundles.remove({ name })` frees one.
- **Live content after the app shipped** (a live-ops event, ADR 0122 step 6): add the event's
  collection (and an on-demand bundle group for its art), then make a content release on the code
  that shipped and publish it:
  `gameengine release pack --version 8 --key content-key.json --content-of <the shipped release>` (a
  release directory, or the `shipped/` folder a store build keeps beside its report), then upload
  its `files/` as it is, `content-manifest-<platform>-<abi>.json` last. The app finds the manifest through
  `releases.manifest.url` (a template with `{id}`, `{channel}`, `{platform}`, `{abi}`; the engine then
  downloads and applies it by itself) or the game fetches it from
  your live-ops backend and passes it to `check({ manifest })`, and accepts it because
  `releases.trusted` lists the content key's public half as `contentKey`:

  ```ts
  import { services, collections, requireCollections, collection } from '@gameengine/runtime';

  const { available } = await services.releases.check({});   // or check({ manifest }) with one you fetched
  if (available?.live) {
    await services.releases.download({ id: 'MyGame' });       // only the files this device lacks
    await services.releases.apply({ id: 'MyGame' });          // live: the next step runs on the new content
  }
  services.releases.on('available', (a) => hub.showUpdate(a)); // the engine's own checks (start, foreground)
  if (collections().halloween) await requireCollections(['halloween'], { priority: 'interactive' });
  const levels = collection('halloween').data.LevelDef;       // listData() lists only the app's own keys
  ```

  A content key signs data and art, never code: its releases are accepted only on code the device
  already trusts (`E_UNTRUSTED` otherwise), so a leaked content key cannot run anything. The
  feature's code ships in the app (or a code release signed with the release key) and is driven by
  the release's data. Sim systems see only the app's own collections: the UI learns of new content
  and tells the sim through an input or event. An update to a bundle in use mounts at the next
  start unless you `loading.run({ collections, applyUpdates: true })`. Tests apply content with
  `tests/releases/<name>/` (skill `testing`); mock `releases.check` with `services.mock`.
- A hub drawing another game's art (its list icon, background): the game publishes it as an in-app
  bundle of its own, ahead of `base`, holding textures, each with `atlas = "none"` in its `.gmeta`, and videos only:

  ```json
  "bundles": [{ "name": "hub", "include": ["assets/hub/**"], "delivery": "in-app" }, { "name": "base", … }]
  ```

  The hub mounts it from the game's newest release and draws it under the game's id; it ships none of it:

  ```ts
  await services.releases.check({ id: 'MyGame' });                        // keeps its content manifest
  const { prefix } = await services.releases.mount({ id: 'MyGame', bundle: 'hub' }); // 'MyGame:'
  <Sprite src={`${prefix}hub/icon`} />                                     // MyGame's assets/hub/icon.png
  ```

  The bundle is checked against the SHA-256 the signed manifest lists, kept for later and offline
  starts, and replaced when a newer release changes it. Its textures are found only as
  `<id>:<alias>`, so they never shadow the hub's own, and the sim never reads them. Anything but
  textures in it is `E_FORMAT`; a game that publishes none is `E_NOT_FOUND` (show generic art).
- Uploading is the build server's job, never the game's: release builds list `onDemandBundles`
  (path, key, sha256, bytes) in `build-report.json`, and the server uploads each key the CDN does
  not have before publishing the app. In tests, point `delivery.url` at a local folder, or mock
  `bundles.request` with `services.mock`.

## Collections and asset groups

A collection says **what belongs together**. Bundles (above) use it for **what ships where**
(in the app or downloaded); asset groups (`assets.groups`, skill `asset-memory`) use the same
closure for **what is in memory when**: `"world-2": { "include": ["collection:world-2"] }`.
Declare the content once as a collection and point both at it.

- On-demand: UI code awaits `requestCollection('world-2')`, then `assets.load('world-2')` (or
  `loading.run({ load: ['world-2'], … })`) before `scenes.enter` into its scene.
- Budgets count group members as cooked: `gameengine memory report --device phone-low` per group.

## 5. Check

```sh
gameengine collection list                # collections, bundles, delivery, sizes of their closures
gameengine collection deps world-2        # every file it ships (* = named in include)
gameengine collection check               # broken refs, and files two bundles both need
gameengine collection data LevelDef       # every data asset of a type and its collections
gameengine cook . --platform android      # the per-bundle report shows what landed where
gameengine bundles list --platform android --cook --against last-release/build-report.json
                                          # keys, and which on-demand bundles are new or changed
```

A file needed by collections in **different bundles** lands in only one of them; `check` lists
these. Move shared content (UI atlas, common prefabs) into a collection in the base bundle.

Test content like code: a `worldTest` that loads every `listData(Type)` record and checks it is
playable (e.g. the level is solvable) catches broken data before a designer ships it.
