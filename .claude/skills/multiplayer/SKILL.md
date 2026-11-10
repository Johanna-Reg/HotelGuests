---
name: multiplayer
version: 1.16.1
tier: optional
description: Online multiplayer — fixed matches, open rooms (join while it runs), always-open worlds, authoritative or relay servers, web/native clients, rollback, turn and snapshot sync, matchmaking and LAN. Use for online play, persistent worlds, deploying servers, late join or reconnect.
---

# Multiplayer

**Covers:** Set up and work with multiplayer in Game Engine — the `multiplayer` block, real-time (rollback) and turn matches, relay vs authoritative servers, the input map, `multiplayer.join/submitTurn/say`, server notices and events (`mp send`, `defineServerTask`), hidden objects and fog of war, input vs snapshot sync, `mp test`, `mp serve`, `mp balance`, `build server`, TLS, flood limits, matchmaking (`defineMatchmaker`, parties, ratings), and PC matches a player hosts (`multiplayer.host/lanHosts/joinHost`, `run --host/--join`, LAN discovery, firewall errors). Use when adding online play, a LAN or player-hosted PC match, a match server, turn or async turn games, ranked matchmaking, parties, server-driven events or emotes, fog of war or anti-wall-hack, or deploying servers.

One system for phones, PCs and browser builds, real-time and turn by turn. Players send only their **input**,
packed: buttons and a stick per frame (a few bytes, delta-coded), or one event per turn. A
**match server** is the clock: it confirms every player's input for every frame (or turn) and
sends the confirmed stream to everyone. Each device runs the whole game from that stream; real-time
games predict ahead and roll back when the confirmed input differs (skill `rollback-multiplayer`).

| | Relay server | Authoritative server |
|---|---|---|
| Runs game code | no | yes: steps every room from the cooked game |
| Truth | the clients' hashes (it compares them) | its own hash: a client that differs is told `desync` |
| Clients | any build | only the same build (`E_MISMATCH` otherwise) |
| Cost per room | bytes only | one sim step per frame per room |

Pick relay for casual and turn games with trusted clients; authoritative when a cheating client
must not be able to win (ranked play, economies).

## 1. Set it up

Add the block to `project.gameengine.json` (every field is optional; the scalars shown are the defaults, `buttons` and `stick` are empty by default):

```json
"multiplayer": {
  "server": "ws://127.0.0.1:7600",
  "mode": "realtime",
  "players": 2,
  "authority": "relay",
  "turnOrder": "roundRobin",
  "port": 7600,
  "window": 12,
  "buttons": { "dash": [{ "key": "Space" }, { "button": 0 }], "fire": [{ "key": "KeyJ" }, { "button": 1 }] },
  "stick": {
    "x": [{ "negative": "KeyA", "positive": "KeyD" }, { "axis": 0 }],
    "y": [{ "negative": "KeyS", "positive": "KeyW" }, { "axis": 1 }]
  }
}
```

- `mode`: `realtime` (frames at the game's rate, rollback) or `turns` (one event per turn). A
  match runs at `sim.dt`'s rate (30, 60 or 120 Hz); the server never mixes rates in a room
  (`E_FRAME_RATE`) and quick match pairs only players at one rate. Anything you write in frames
  (`window`, `interest.every`, `snapshot.interpolation`) is frames at that rate.
- `players`: 1–32, or 1–256 with `"sync": "snapshot"` (every peer steps every player in input
  sync, so above 32 use snapshot sync).
- `buttons` (≤ 32, in the order of your `defineButtons`) and `stick` map keys and gamepad 0 to the
  packed input, with the same bindings as `input.json` (`key`, `negative`/`positive` keys, gamepad
  `button` and `axis`). Touch controls add to it
  with `multiplayer.setInput(buttons, [x, y])`, OR-ed with the mapped keys.
- `window`: how many frames a real-time client may run ahead of what the server confirmed (a rollback
  keeps this many sim snapshots). A client needs about `rtt + margin` frames of it: past roughly
  130 ms round trip the default 12 stalls the sim (`status().windowStalls`).
- `pacing` (real-time; client scheduling only, the confirmed inputs and hashes do not change):
  `adaptive` (default true) takes the margin the client keeps between its inputs and the server's
  clock from measured jitter, between `minMarginMs` (33) and `maxMarginMs` (150);
  `maxWindow` (default 0) lets the window follow the round trip up to that many frames, so a slow link
  does not stall while a fast one keeps rollbacks shallow (costs `maxWindow + 2` snapshots, set it
  to 30–40 for a game played on mobile data, 0 for a LAN game); `inputDelay` (0–4, default the
  server's 1) is the frames between a local input and the frame it applies to: 0 applies it to the
  frame being simulated and the client then runs that much further ahead. `adaptive: false` is the
  old fixed margin and window. `status()` shows `marginMs`, `jitterMs`, `window`, `inputDelay`,
  `stalls` split in `windowStalls` and `pacingWaits`.

## 2. Join from presentation, read the match in sim

```ts
import { multiplayer } from '@gameengine/runtime';

// UI or a LateUpdate system: differs per device
multiplayer.join({ room: 'abc' });             // or {} for a quick match; seat: '<token>' to come back
for (const e of multiplayer.events()) {        // welcome, start, joined, left, desync, error, closed
  if (e.type === 'welcome') saveSeat(e.seat);
}
const s = multiplayer.status();                 // phase, player, rttMs, rollbacks, turnPlayer, …

// sim: the same on every device and the server
const m = multiplayer.match();                  // { players, mode, seed } or null outside a match
```

When the match starts the world is **rebuilt** from the scene and the RNG is seeded with the
match seed on every device, so all peers and the server start from the same state. During a
match the sim sees the project's reference resolution as `ViewInfo` (not the device's screen),
and device events (taps, keys, UI events) never reach the sim: only `PlayerInputs` (real-time)
or the turn events do. Layout and touch targets read the real screen in presentation as usual.
A mouse-look game reads the mouse with `multiplayer.pointer()` (`x`, `y`, `dx`/`dy` since the last
call, `buttons` bit 0 left, 1 middle, 2 right) in a LateUpdate system and sends the look through
`setInput`. `leave()` from a started match rebuilds the world on the next frame, so the game is
back in a fresh offline world, not the match's last state.

`join`, `leave`, `status`, `events`, `setInput`, `pointer`, `onSample`, `onPredict` and `submitTurn` throw
inside a sim system.

### Input latency and prediction (real-time)

- **Sample at the latest moment.** `setInput` from a LateUpdate system reaches the sim one step late
  (it runs after the frame's steps), plus `pacing.inputDelay`. `multiplayer.onSample(() => { … })`
  (module level, one function) is called by the engine before every match step, outside the sim: read
  `pointer()`, call `setInput`, and the mouse of this frame is in the frame about to be simulated.
  With `inputDelay: 0` that is zero frames from mouse to sim (two with LateUpdate and the default).
  The function has no `ctx`; keep what it needs (the look angles) in presentation state and show
  the same state in LateUpdate.
- **Show your own look at once.** The sim learns a rollback correction of your seat later; show the
  camera from presentation state instead: write a `VisualOffset` rotation on the entity a
  `VirtualCamera` sits on (relative to its sim pose), which the camera now follows.
- **Predict other players.** A missing remote input repeats that seat's last one, wrong at every
  change. `multiplayer.onPredict(({ seat, frame, history }) => ({ buttons, stick }))` returns a better
  guess from the seat's last eight confirmed inputs (`history`, oldest first, each with its frame);
  null repeats the last. It must be **pure** (no `Math.random`, clock or state of its own), cheap (a few
  calls a frame per remote seat, re-simulated frames too), and only decides speculative frames:
  the server's input replaces it and the frames that differ are re-simulated, so it cannot desync.
  Extrapolate by `frame − history.at(-1).frame`, not by one step: the history lags by the round trip.


### Browser builds

`gameengine build web` uses the same multiplayer API, wire protocol and match client as native
players. A configured browser game joins the same authoritative or relay server and follows the
same balancer redirects, with input, snapshot or turn sync. Use `wss://` from HTTPS and keep build
identity compatible across targets. Browser clients cannot host a server or discover LAN hosts.
Name entry, lobby screens and invitation parsing belong to the game.

Browser callbacks only queue packets; the engine polls them at its normal match boundary. Each
match permits 256 KiB packets and a 2 MiB / 256-event receive queue. Its pre-open queue permits
8 packets / 64 KiB, so the hello waits safely for the connection. Backpressure, overflow and failed
connections reach `multiplayer.status().error` / `events()` explicitly. Hidden tabs stop stepping
and can disconnect. Save the seat token and use the game's reconnect policy on return.
The engine's explicit `pnpm test:web:multiplayer` verifies mixed native/browser authoritative input
and snapshot matches; see `ship-web` for toolchain and runner setup.

## 3. Real-time games

### Open rooms: join a match that is running

A fixed match starts when every seat is taken. For an arena people drop in and out of, make the room **open** (ADR 0439): it starts at its first seat, a quick match joins the fullest running room that has a seat free (else makes one), and a seat is retaken as players leave. Real-time, input sync, `authority: "server"` only:

```json
"multiplayer": { "mode": "realtime", "authority": "server", "players": 4, "lateJoin": true }
```

`lateJoin` is `true` or `{ "event": "SeatChanged", "graceSeconds": 15 }`; `join()` is open by default then (`join({ open: false })` for a fixed match). Declare the event in the schema with `seat: u32()` and `present: bool()` (the server refuses to start without them; `fresh: bool()` is optional and sent only when declared): the server raises `{ seat, present, fresh }` at the **same frame on every device and the server**, so the sim, not presentation, decides who exists:

```ts
// schema/game.schema.ts
export const SeatChanged = event('SeatChanged', { seat: u32(), present: bool(), fresh: bool() }, { sim: true });
// a sim system with events: [SeatChanged]
for (const e of ctx.events.read(SeatChanged)) { /* set the seat entity's `active` to e.present; reset it when e.fresh */ }
```

- **Seats exist always** (one entity each, an `active` flag the event sets): a seat without a player plays the neutral input, never its last one. Leave and disconnect both raise `present: false` (200 ms after the change, on the same frame everywhere, like every presence event); a reconnect that replaces its own live connection raises nothing; `fresh` is true when a new player takes the seat and false when the one it was held for returns, so reset a seat's score on `fresh` only.
- A clean leave (`multiplayer.leave()`) frees the seat; a lost connection holds it for `graceSeconds` (the player returns with `join({ seat })`, which the game does after a reconnect). A room with every seat free ends; it has no length limit.
- A player who joins a running room is sent the server's world (at most 1 MiB; a bigger world refuses the join with `E_LIMIT`) and continues from it: do not keep sim state outside the world (the same rule as for rollback), or the joiner differs from the others. The first `status().frame` is the room's frame, not 0.
- `MatchEvent` `joined` / `left` (presentation) arrive once each for toasts ("Ana joined"): `left` when the player leaves or drops, `joined` when a seat is taken or its held player returns. A hold running out sends nothing more, and a joiner is not told about the players already there (read the sim's seats). Use the sim event for anything that changes the game.
- **A lobby list:** `multiplayer.rooms({ server })` lists the open rooms running on one match server: `null` until it answers, then `{ server, rooms: [{ room, seats, taken, free }], ageMs }`, at most 64 rooms with a free seat first, then the fullest. Call it every frame the lobby shows (it asks once a second and stops 10 s after the last call or on `join`), and join a row with `join({ server: listing.server, room: row.room })`; a full room answers `E_FULL`. Its error is thrown, and thrown again for 5 s before it reconnects. The list is **per match server**: a balancer refuses it (`E_BALANCER`), so a lobby across servers asks each one (every frame is fine: one connection a server, up to 8). It shows room names and seat counts only, never players or seat tokens.
- Test: `gameengine mp test --authority server --players 4 --initial 1 --frames 2400 --churn join@300,join@600,drop:1@1200,back:1@1500,leave:2@1800` (hash agreement for every peer that joined, empty-seat input, `--grace-secs`, `--replay-join` to measure the replay it avoids; such a room keeps its whole log and ends at the 64 MiB limit). A server from before this release answers an open hello `E_VERSION`: ship the server and the clients from one engine release.


### Always-open worlds instead of fixed matches

For a continuously available world, use `multiplayer.world` (ADR 0311). This runs the cooked game in the real authoritative server export, without a separate Node simulation:

```json
"multiplayer": {
  "authority": "server",
  "world": { "inputEvent": "WorldInput", "document": "SharedState", "sendEvery": 6 }
}
```

Declare `WorldInput` as an empty `sim: true` event and `SharedState` with `defineDoc`. Import `WorldInputFrame` from the runtime and consume `ctx.inputData<WorldInputFrame>(WorldInput)` in the server's sim system. Each frame envelope contains ordered events: `{kind:'start'}`, `{kind:'join',player,name}`, `{kind:'input',player,data}`, or `{kind:'leave',player}`. `player` is a server-assigned 32-bit identity; validate `data` as player intent, never accept client-provided authority or another actor id. The start event initializes the world. Update the document from sim with `ctx.rng`/`ctx.dt`, not time or presentation. The initial step must create the configured document.

In presentation, `await multiplayer.world.connect({server: 'wss://host/game/socket', name})` returns a connection. `send(data)` sends intent. `subscribe(handler)` delivers `{kind:'welcome',player,version}`, `{kind:'snapshot',tick,document}`, `{kind:'error',error}`, and `{kind:'closed',reason}`. Validate the document and feed it to a local sim consumer using `emitInputData` on a separate empty marker. `poll()` is an alternative to subscription. Close the connection on view/session disposal. Implement reconnect and alias UI in the game; the connection supplies heartbeat replies. Rejoining obtains an available identity, so reset connection-local input and presentation state.

Build web and `build server --target linux-x64 --authority server` from matching source/engine/config. The engine enforces game/build identity. Use the public WSS URL; no game-owned wire protocol or Node gameplay server is needed. The Linux export includes its cooked `game/` and the WebGPU wrapper; from macOS or Windows it packages the release's published Linux server. `--dry-run` is not runnable.

A world starts immediately, accepts late joins, reuses disconnected identities and waits while empty without resetting. It ignores fixed-match `players`; actual capacity remains bounded by resources and operator connection guards. A process restart resets it. One changed full document is sent at most every `sendEvery` fixed steps, with fresh state for new joins and pacing for slow sockets. Input is limited to 4 KiB and full state to 256 KiB. Oversize state or sim failure stops the server explicitly for supervisor restart. This mode has no interest filtering, client prediction, accounts, database or multiple-world sharding. Fixed matches continue to use `multiplayer.join` and `PlayerInputs` below.

In a browser, a hidden page runs no frames; the web player keeps a world connection alive by itself meanwhile (it answers pings and keeps only the newest snapshot, which `subscribe` delivers on resume), so switching windows is not a departure. A frozen or discarded page still disconnects; treat that as a leave.

An authoritative server accepts only clients of its exact build (`<version>-<script hash>`); a browser build and a server build of one commit can still differ (a build step's define, one machine transpiling and the other not). Build the server from the browser build's script and check the pair before shipping:

```bash
gameengine build web --config release --out build/web
gameengine build server --target linux-x64 --script-from build/web
gameengine mp identity build/web .gameengine/build/server/linux-x64   # ok, or what differs and why
```

A refused hello says `E_MISMATCH: this server runs <game> build <id> (client: <game> build <id>)`.

Run `GAMEENGINE_E2E_DIR=<isolated scratch> GAMEENGINE_WORLD_HOST=<native host> pnpm test:world:server` for the explicit real-server E2E. Test two actual compiled clients against the published cooked server as well; a healthy socket alone does not prove gameplay.

Sim systems read `PlayerInputs` with `playerInput(inputs, index)` and `defineButtons` exactly as
in `rollback-multiplayer`. Seats 4 and up live in `MorePlayerInputs`: a game for more than four
players reads them with `playerInput(inputs, index, ctx.get(MorePlayerInputs))` (declare
`read(MorePlayerInputs)`; a match of four or fewer never writes it, so its hashes do not change).
`rollback-multiplayer` lists the rules (all state in the world, `math.*`, no physics
bodies: a real-time match on a physics game leaves with `E_ROLLBACK`). Keep a step well under
2 ms: a rollback re-simulates several frames at once.

## 4. Turn games

A turn is one schema event. Declare it, raise it with `submitTurn`, handle it in a system:

```ts
// schema: PlaceMark { player: u8, turn: u32, cell: u8 }
multiplayer.submitTurn({ $event: 'PlaceMark', cell: 4 });   // presentation
```

Once the server accepts the turn, every device (and an authoritative server) steps the world
**once** with that event; `player` and `turn` are filled in when the type has those fields. The
world also steps once when the match starts. With `turnOrder: roundRobin` the server refuses a
turn out of order (`E_NOT_YOUR_TURN` in `events()`); `free` accepts anyone's. A payload is a JSON
object of at most 4 KB. Validate the move in the system (it is the rule), not only in the UI.

Turn matches survive a server restart when it runs with `--store <dir>`, and players come back
to their seat with the `seat` token from `welcome`. With a store, a turn reaches the players (its
player included) only once it is written, so a server killed at any moment never loses a turn a
player saw: expect up to a tick more per turn (the write itself is well under a millisecond on
a local disk). While the store falls
behind (its queue three quarters full, or its heartbeat late) turns and joins get `E_BUSY`: retry.

**Async turn games** (matches that last days; ADR 0128). With a store, a match nobody is
connected to leaves the server's memory after a minute and comes back when a player rejoins, so
one server holds about 100,000 matches. Keep the `seat` token (save it with the player's data)
and join with it to come back. Servers behind one balancer may share the store folder; a match is
open on one at a time (another answers `E_ELSEWHERE`: join again).

```jsonc
"multiplayer": { "mode": "turns", "turnOrder": "roundRobin",
  "turnLimit": { "seconds": 86400, "event": "TurnTimedOut" } }   // 10 s – 30 days
```

When a turn runs out, the server takes it **as that player** with the event (`TurnTimedOut`
with a `player` field tells the system whose it was): handle it like any move (skip, forfeit
after N). `multiplayer.events()` gets `{ type: 'turnDue', player, at }` when each turn begins
(`at`: the Unix second it runs out, null without a limit) and `status().turnDue` holds it, for a
countdown. To tell a player who is away, join with `notify` (a push token or your player id, at
most 256 bytes):

```ts
multiplayer.join({ room: savedRoom, seat: savedSeat, mode: 'turns', notify: pushToken });
```

and run the server with `--notify-url https://your-backend/turns`: it POSTs
`{ type: 'yourTurn', game, room, seat, turn, due, notify }`, signed with
`X-Gameengine-Signature: sha256=<HMAC-SHA256 of the body with GAMEENGINE_MP_KEY>`. Check the
signature in your backend, then send the push. Real-time matches and live turn matches played in
one sitting need none of this.

## 5. What the server sends that is not input

Pick by what it touches:

| You want | Use | Reaches |
|---|---|---|
| A message players see (quest live, maintenance soon) | a **notice** | `multiplayer.events()`: `{ type: 'notice', topic, from: null, data }`; never the sim |
| An emote or chat line from a player | `multiplayer.say('emote', { id: 3 })` | the room's other players as a notice `from` that seat (four a second, 256 bytes) |
| Something that changes the match (the arena shrinks, a quest spawns) | a **server event** | the sim, as a schema event, at the same frame on every device |

A server event is an ordinary sim event (`event('ShrinkArena', { radius: f32() }, { sim: true })`)
handled by a system with `runOn`. In a real-time match it lands at the next frame (or `inFrames`
later) and clients that ran ahead roll it back in; in a turn match it is a turn of the server's
(no `player`; round robin skips it), sent only to the room the command names (`--room`,
`{ room }` from a task): a broadcast leaves turn matches alone. Never put an emote or anything a player can spam into the
sim through button bits: it is presentation, so `say` it.

Send them by hand or from a backend (the server needs `GAMEENGINE_MP_KEY`, 16+ characters, set
when it starts; send to a balancer to reach every server of the game):

```bash
export GAMEENGINE_MP_KEY=…
gameengine mp send --server ws://host:7600 --notice quest --data '{"id":"A","text":"Seek the tower"}'
gameengine mp send --server ws://balancer:7700 --event '{"$event":"ShrinkArena","radius":5}' --in-frames 60 --game RollbackArena
gameengine mp send --server ws://host:7600 --room abc --seat 1 --notice hint --data '{"text":"Look north"}'   # one seat only
```

Or from the game itself on an **authoritative** server, every N seconds:

```ts
export const closeIn = defineServerTask({
  name: 'closeIn',
  every: 20,
  run(ctx) {
    const radius = 8 - (Math.floor(ctx.seconds / 20) % 6);    // from the clock: every server agrees
    ctx.notice('arena', { radius });
    ctx.event({ $event: 'ShrinkArena', radius }, { inFrames: 60 });
  },
});
```

Each server instance runs its own tasks, so derive what all servers must share from the time,
not from chance, or pick it centrally and `mp send` it. A relay runs no game code: drive it from
outside. Task code ships in the game bundle, so keep secrets in a backend.

**Scores and standings.** Points inside a match (one per kill, all lost on death) are sim
state: a document or component written by sim systems, the same on every device frame by frame.
The leaderboard is a view reading it; send nothing. A standing across matches (the best current
streak on the server) must come from the server's worlds, not a device: name the document in
`reads` and read each room's copy with `ctx.read` (8 documents per task, copied only for due
tasks, at most 256 KiB a run across every room: keep read documents small). `rollback-arena`'s `streaks` task:

```ts
export const streaks = defineServerTask({
  name: 'streaks',
  every: 10,
  reads: [scores],                                         // a defineDoc handle or its name
  run(ctx) {
    for (const r of ctx.rooms) {
      const streak = ctx.read<{ streak: number[] }>(r.room, scores)?.streak ?? [];
      // … find the leader, then:
      ctx.notice('streak', { player, streak: n }, { room: r.room });
    }
  },
});
```

A high score across every server needs a backend fed by the servers, never by devices; a task
posting to a backend is not built yet.

## 6. Hidden things and fog of war

By default every device holds the whole match, so a hacked client can read where everything is.
Two tools keep things off devices; both need `"authority": "server"`.

**Who sees what: `InterestArea`.** An engine component on the entity a seat sees from: `seat`,
`shape` (`Circle` with `radius`, or `Box` with `half`). It is sim state (a sim system may widen or
narrow it, e.g. darker as the arena closes), and the server reads it from its own world, so a
client cannot claim to see more. Tune it in the block:

```json
"interest": { "every": 6, "margin": 0.5, "maxRadius": 64 }
```

`every`: frames between the server's passes (1–60; raise it on a busy server, a pass costs seats ×
objects × areas). Claims are tested at pass frames too, so a game with small claim radii and fast
players keeps `every` low (2–3) or a player can run through a gem between two passes. `margin`: a thing leaves view only past the area plus margin, so nothing flickers
at the edge. `maxRadius`: the server clamps every area to it.

**Things to find: `defineHiddenSet`.** Items, loot, traps that only the server holds and shows to a
seat while its area covers them. Players stay visible (to hide players, use snapshot sync below).

```ts
export const gems = defineHiddenSet({
  name: 'gems',
  claim: { radius: 0.5, event: GemFound },           // reaching one claims it ({ player, id, position })
  start(ctx) { scatter(ctx, 0); },                    // server only, when the match starts
  claimed(ctx, c) { if (ctx.count() === 0) scatter(ctx, 100 + c.frame * 16); },
});
function scatter(ctx, first) {
  for (let i = 0; i < 10; i++) ctx.place(first + i, [14 * ctx.random() - 7, 14 * ctx.random() - 7]);
}

// presentation: draw what this device was shown
for (const g of multiplayer.hidden(gems)?.objects ?? []) pool.show(g.at[0], g.at[1]);
```

- `start` and `claimed` run **on the server only**, outside every sim. Place things with
  `ctx.random()` (the OS's randomness), never `Math.random` or `ctx.rng`/the match seed: every
  client has the seed, and `Math.random`'s state can be recovered from what players see.
- The hooks also have `move`, `remove`, `list`, `count`, `notice(topic, data, { seat })` (one seat
  only), `event(payload, { inFrames })` and `read(doc)` for documents named in `reads`.
- A claim is the server's decision: the nearest seat within `claim.radius` (with `claim.buttons`
  held, if set) wins, and `claim.event` lands in every peer's sim at one frame, so count scores in a
  sim system that reads that event (hash-checked like any input). Never score from
  `multiplayer.hidden()`: it is presentation and differs per device. A seat with several areas
  claims from any of them (the claim is tested from each area's entity), so give a seat a second
  area only where reaching from it is fair.
- A server task's hidden moves in one run go out as one batch per set, and a turn room's store is
  compacted after 256 hidden lines, so a task may move many objects a run.
- Limits: 8 sets, 1,024 objects a room, 256 bytes (UTF-8) of `data` each, 16 areas a room.

**Players too: snapshot sync.** Fog of war, stealth, battle royale, extraction: anything where a
player's position must not reach the others. Input sync cannot hide players (every peer needs every
input to step the world), so the server sends each seat the state it may see instead:

```json
"sync": "snapshot",
"snapshot": {
  "components": ["Player", "LocalTransform", "Mine", "Shape", "Bounds2D", "Arena"],
  "always": ["Arena"],
  "docs": ["arena:scores"],
  "maxBytes": 1200,
  "interpolation": 6
}
```

- `components`: what is replicated (≤ 16); an entity with none of them stays as the scene made it.
  `always`: sent to every seat wherever it is (≤ 8). `docs`: documents sent when they change (≤ 8,
  4 KiB each). `maxBytes`: the budget per snapshot (nearest first; deferred ones age up).
  `interpolation`: how many frames in the past other entities are shown (2–30).
- Your sim code does not change and must not branch on the mode. The device predicts its own
  entity and corrects it when the server differs; others are interpolated. Keep sim systems
  correct on a partial world: a system that needs what the seat cannot see must not change the
  seat's own entity from it, or it will mispredict (`status().corrections`, `maxCorrection`).
- `multiplayer.join({ sync: 'input' })` overrides the block for one match, so a game may offer both.
  Snapshot sync needs an authoritative server (`E_SYNC` on a relay) and real time (`E_MODE`).

| Your game | Sync | Why |
|---|---|---|
| Open information, ≤ 32 players, tight mobile data | `input` (default) | constant bytes, relay works, hash-checked |
| More than 32 players (up to 256) | `snapshot` | a seat steps and receives only what it sees |
| Fighting, precise timing | `input` | everyone at the present, no interpolation delay |
| Only items hidden, players may be seen | `input` + hidden sets | adds well under 0.1 KB/s |
| Players must be hidden (fog, stealth, battle royale) | `snapshot` | only state sync can hide players |
| Large worlds where a seat sees little | `snapshot` | bytes grow with what a seat sees |
| Turn games | `input` (turns) | snapshot turn matches are not built |

Measured on `samples/rollback-arena`, 4 players: input sync 2.2 KB/s up and 2.4 KB/s down per
player on the wire, snapshot 2.1 up and 2.8 down. On `samples/crowd-match` (bots that change
input every frame): 32 players in input sync 2.2 up and 6.3 down, 200 in snapshot sync 2.1 up and
4.0 down. Not built in snapshot mode: predicting your own
spawns (they appear after a round trip), lag compensation, sim events a seat may see (hits,
sounds: show them from state), physics, per-seat RNG streams.

`ctx.rng` is not reconciled in snapshot mode: corrections write replicated components, not the RNG
state, and every client has the match seed. Anything a player must not predict (loot, spawns,
cards) is decided by the server in hidden-set hooks with `ctx.random()`, never by `ctx.rng` in a
sim system. A client that falls more than the rollback window behind (a hitch, a rejoin) jumps to
the server's frame from one snapshot instead of re-simulating; a server room of 100 replicated
entities and 4 seats holds about 82 KB of replication state.

## 7. Test every change

```bash
gameengine mp test --players 2                         # relay, bots, simulated 4-frame latency + jitter
gameengine mp test --authority server --latency 3 --jitter 3 --adaptive off   # the fixed pacing; compare stalls, late inputs and depth
gameengine mp test --players 4 --authority server      # the server steps the game; hashes compared to it
gameengine mp test --latency 10 --jitter 6 --frames 1200 --js hermes
gameengine mp test --authority server --frames 1500 --event '{"$event":"ShrinkArena","radius":5}'
gameengine mp test --players 4 --authority server --sync snapshot   # snapshot sync: truth and leak checks
gameengine mp test --players 32 --authority server     # up to 32 in input sync, 256 with --sync snapshot
gameengine mp test --authority server --players 4 --open on --initial 1 --churn join@300,drop:0@900,back:0@1100 --frames 1800   # open room: joins from the world
```

`mp test` runs at the game's rate and reports it (`rate`), with ms per tick for everything, the
server alone (`serverMsPerTick`) and one client frame with its rollbacks (`clientMsPerFrame`), and
`rollback`: every peer's rollbacks summed (it lists the first 8 peers).

With hidden sets, an authoritative run places a probe where each seat stands and one far outside,
and fails on a leak (a seat shown anything outside its areas plus margin) or a probe never shown.
`--sync snapshot` fails when a seat's decoded state differs from what the server sent it
(`truthDiffs`) or an entity reached a seat outside its area (`leaks`); it prints `corrections`
per peer (mispredictions of its own entity) instead of hashes. `truthDiffs` also counts a seat
whose decoded cache no longer matches its live world (`staleCache`: a correction that missed an
entity). The server's hidden-set randomness comes from `--seed` in a test run, so a failing run
repeats with the same seed.

`--event` raises a server event a third of the way in; an authoritative run also runs the game's
server tasks (`server.taskCommands` in `--json`). Test a server event's handler like any event:
`input.emit(ShrinkArena, { radius: 5 })` in a game test.

`--latency` and `--jitter` are one way, in frames; the pacing flags (`--adaptive on|off`, `--max-window N`,
`--input-delay N`) override `multiplayer.pacing` for the run. It prints per player the margin and
jitter it measured, the window in force and the stalls (at the window / waiting on purpose), and
`lateInputs`: inputs that reached the server after their frame, which it repeated the previous one for
(the player's own input is then corrected on their device).

`ok: false`, a `divergence` or a `desyncs` entry means state lives outside the world or depends
on the device: fix it, never loosen the test. It also prints payload and on-wire bytes and packets per
player per second (`--send-every 1|2|4` compares packet rates) and ms per server tick. `gameengine net test` (peers against a perfect reference, `--synctest`)
stays the fastest check for real-time sim code. Keep one `mp test` line in CI (one per sync mode
the game uses).

In the editor: **Build → Multiplayer…** runs the match test and starts a local server.

## 8. Run a server

```bash
gameengine mp serve                                    # from this checkout, port 7600
gameengine mp serve --authority server --store matches --listen 0.0.0.0:7600
```

It prints one JSON status line every `--status-sec` (rooms, players, bytes in and out, refused,
rate-limited and timed-out connections, `slowClosed` for those closed for not reading, `memory`
against its budget, `capacity` for an authoritative server, `turnStore` with what is queued). Play in the editor and devices on the same network join
with `server: 'ws://<this machine>:7600'`.

## 9. Build and deploy a server

```bash
gameengine build server                                # this machine's OS, authority from the project
gameengine build server --target linux-x64 --authority server --port 7600
gameengine build server --target windows-x64 --authority relay
gameengine build server --target macos-arm64 --dry-run # the folder without the binary (finish it on a Mac or CI)
```

Or **Build → Build Multiplayer Server…** in the editor. The folder (default
`.gameengine/build/server/<target>/`) holds `gameengine-server[.exe]` (for a relay the
`gameengine-relay` binary, about 5 MB with no engine in it; for an authoritative server the engine
host, which runs the cooked game), `run.sh` / `run.cmd`,
`server.json`, a `README.md`, a `Dockerfile` on Linux and, for an authoritative server, the
cooked game in `game/`, plus `run-balancer.sh` / `.cmd`. Copy it to the machine and run the script
(`PORT`, `STORE`, `TLS_CERT`/`TLS_KEY`, `BALANCER`/`PUBLIC_URL`, `GAMEENGINE_MP_KEY` from the
environment), or `docker build -t my-game-server . && docker run -p 7600:7600 my-game-server`. A
Linux x64 server (relay or authoritative) or a Windows x64 relay builds on any OS: from another
OS, or in an installed editor, the build downloads the release's published binary once and packages
it. A checkout between releases names that release with `--player X.Y.Z` (the game cooked by a newer
engine may not run on it). Other targets build on their own OS (`E_CROSS` otherwise). `--out` must be empty or an earlier server build.

Rebuild and redeploy an authoritative server with every game release: it accepts only its own
build.

Each connection holds an open file: a server raises its soft limit (`ulimit -n`) to the hard one
at start and warns when `--max-conns` needs more. In Docker pass `--ulimit nofile=65536:65536`.

## 10. Encryption and flood protection

- **Always `wss://` on the internet.** `--tls-cert <pem> --tls-key <pem>` (or `TLS_CERT`/`TLS_KEY`
  for the run script) makes the server speak TLS itself; or put Caddy, nginx or a cloud load
  balancer in front and keep the server on plain `ws://` behind it. A client never follows a
  redirect from `wss://` to `ws://`.
- Seat tokens and room codes come from the OS random source: knowing one player's token or a
  room's seed tells you nothing about another's.
- Every server and balancer refuses connections over `--max-conns` (10000), over `--max-per-ip`
  (256) or `--connects-per-min` (600) per address, closes one that has not said hello in 5 s or
  is silent for 30 s, and closes one sending more than 240 messages or 32 KiB a second
  (`E_RATE`). A client sends 30 packets a second, so the limits sit far above real play. Behind a
  proxy every player has the proxy's address: set `--max-per-ip 0 --connects-per-min 0` and
  limit at the proxy.
- A connection that stops reading what it is sent is closed once 2 MiB wait for it (`slowClosed`
  in the status line); a turn match's catch-up for a rejoining player waits for a slow link
  instead, and closes it (`E_SLOW`) only after 10 s of taking nothing.
- New rooms and stored matches are refused with `E_BUSY` (try again) while the rooms in memory
  hold `--max-memory-mib` (2048) between them. Sockets live on `--reactors` threads (default half
  the cores, 1–4), not a thread each.
- Anything a client sends is hostile input: the server bounds every decoded message, ignores
  hashes for frames it has not confirmed, and refuses a turn out of order or over 4 KB. Validate
  moves in sim systems too, since a relay runs no game code.

## 11. Many servers: the load balancer

```bash
export GAMEENGINE_MP_KEY=<16+ random characters>         # the same on the balancer and every server
gameengine mp balance --listen 0.0.0.0:7700              # or ./run-balancer.sh in a server build
gameengine mp serve --balancer ws://balancer:7700 --public-url wss://game-1.example.com:7600
```

Players join the balancer's address (`server: 'wss://play.example.com'`). It answers each hello
with a redirect: a quick match (`join({})`) fills one room on the least-loaded server; a named
room always lands on the same server, so friends meet. Servers report rooms and players every
2 s and drop out after 6 s of silence; add a server by starting it, remove one by stopping it
(its rooms end). The key never goes on the command line (it would show in the process list).

Servers describe themselves so quick match and the game's matchmaker can pick: `mp serve
--balancer … --region eu-west --tags ranked,beta --seats 4000` (at most 8 tags; `--seats` is
players at once, 0 for no limit). An authoritative server also registers its sim rate, and a
player is only sent to a server of its rate (a relay takes any).

Measure before sizing: `mp test --players 4 --authority server` gives ms per server tick. A relay
ticks at 60 Hz unless `mp serve --tick-hz 120` (rooms at 120 Hz then get one frame a tick instead
of two); an authoritative server ticks at its game's rate.

## 12. Matchmaking the game writes

Quick match is enough for casual play. For skill, region, parties or modes that fill differently,
write the rule in the game's TypeScript and export it from `main.ts` (ADR 0125):

```ts
import { defineMatchmaker, type MatchGroup, type MatchTicket } from '@gameengine/runtime';

export const ranked = defineMatchmaker({
  queue: 'ranked',       // a room name's rules; at most 16 queues a game
  every: 1,              // seconds between rounds, 0.1 or more
  match(tickets: readonly MatchTicket[], servers, round): MatchGroup[] {
    // tickets: { id, players, waitSec, attributes, verified, party? }, at most 4,096 a round
    // servers: { url, region, tags, rate, rooms, capacity, players, freeSeats, load }
    return [{ tickets: [tickets[0]!.id, tickets[1]!.id], server: { region: 'eu' } }];
  },
  bot: (i) => ({ attributes: { region: 'eu' }, verified: { rating: 800 + i } }), // for mp match
});
```

```ts
// presentation, against the balancer's address
multiplayer.join({ queue: 'ranked', attributes: { region: 'eu' }, token, party: { id: partyId, size: 2 } });
// events(): { type: 'queued', queue, waiting } while it waits, then the usual welcome
```

- **No secrets in it:** `defineMatchmaker` (like `defineServerTask`) is in the device bundle too,
  where it does nothing; the token key lives only in your backend and in `GAMEENGINE_MM_KEY`.
- **Run it:** `gameengine mp balance samples/my-game` (`--match-budget-ms`, default 250). Without a
  project, or for a queue no matchmaker defines, the balancer quick-matches as before.
- **Rounds:** each pool (one queue for one build, rate, mode, sync and room size) is offered every
  `every` seconds: the oldest 2,048 tickets, then 2,048 from a cursor through the rest, so a long
  queue is seen over several rounds. Return groups of ticket ids. `server` is a url, `{ region,
  tags }` (that region first, most tags, least loaded) or nothing (least loaded). The balancer names
  the room and redirects every player with its size. A group naming a gone ticket, a ticket twice,
  half a party, more players than a match holds or a full server is dropped; its tickets wait.
- **Keep `match` cheap and pure:** one round is in flight at a time, on a thread of its own. Past
  the budget a round is skipped and logged; a throw or malformed answer too. Stuck 10 s on one round,
  the matchmaker is stalled and its players get `E_MATCHMAKER` until it answers or, after 30 s, a
  fresh session takes over (at most 3 times; then restart the balancer). `match` is a plain function: test it
  in a `worldTest` on both engines (`rollback-arena/tests/game.test.ts`).
- **Parties:** every member joins with the same `party.id` and `size` (2–8); they wait as one ticket
  (`players` = size), offered once all are there, and are dropped with `E_PARTY` if not all there
  within 60 s. An unsigned party id can be guessed and joined: sign `"party"` into each member's
  token, and it wins over the id the client sends.
- **Trust:** `attributes` (a JSON object, at most 512 bytes) are hints a modified client can fake.
  Ratings, ranks and entitlements come in a token the game's backend signs:
  `v1.<base64url payload>.<base64url HMAC-SHA256 of "v1.<payload>">`, payload
  `{ "game": "<name>", "exp": <unix seconds>, "values": { "rating": 1520 } }` (optionally
  `"queue": "ranked"` to bind it to one queue and `"party": "<id>"`; `exp` at most 24 h away), key in
  `GAMEENGINE_MM_KEY` on the balancer (16+ characters, not the server key). `match` reads checked
  values from `ticket.verified` (null without a token); a bad or expired token gets `E_TOKEN`. Tokens
  are not bound to a player: keep `exp` to minutes.
- **Prove it:** `gameengine mp match samples/my-game --bots 2000 [--arrive-sec 10] [--regions eu,us]
  --json` (MCP `mp_match`) builds bots from `bot(i)`, signs real tokens, registers one server per
  region and reports matched players, room sizes, waits (p50, p95), the largest queue and round cost.
  `--bots 100000 --arrive-sec 0` is the scale case: a round of 4,096 tickets should stay well under
  the budget.

## 13. Hosted on a player's PC (no server)

On PC one player's game can be the match server (ADR 0131): a relay on a thread inside the game.
Phones cannot host (`E_UNAVAILABLE`); they join servers.

```ts
// presentation code: the lobby
const hosted = multiplayer.host({ players: 4, name: 'Ana' }); // port 7600, room 'host', found on the LAN
const found = multiplayer.lanHosts();                         // poll each frame or on a timer; non-blocking
const h = found.find((h) => h.sameBuild);
if (h) multiplayer.joinHost(h);                               // or multiplayer.join({ server: 'ws://192.168.1.20:7600', room: 'host' })
```

- It is a relay: input sync only (whatever `multiplayer.sync` says), 1–32 players, one room, no
  hidden sets or server tasks. The match ends when the host leaves; there is no host migration.
- Finding hosts uses UDP port 7601 on the local network only. Over the internet the host forwards
  TCP 7600 on its router and others join its address; there is no NAT traversal.
- A blocked connection fails in 5 s with the port the host's firewall must allow, and the host
  gets `{ type: 'unreachable', address, port, message }` from `multiplayer.events()`: show both to
  the players, the firewall is the usual cause.
- Try any game without a lobby: `gameengine run --host` on one PC, `gameengine run --join lan`
  (or `--join ws://<ip>:7600`) on the others. `gameengine doctor` checks the ports and, on Windows,
  the network profile and the firewall rules for the game.

## Limits (today)

- A server steps every authoritative room in turn on one thread and one JS VM; it measures its
  rooms per tick at start and tells its balancer that (`capacity` in the status line). Measure with
  `mp test --authority server` (ms per tick) before sizing machines, and add servers behind the
  balancer rather than threads. `WallClock` stands still on the server: do not base match rules
  on real time.
- An authoritative server's binary is the desktop host without the debug protocol (about 70 MB on
  Linux); a relay's is `gameengine-relay` (about 5 MB).
- 1–32 players per match in input sync and turns, 1–256 in snapshot sync; a snapshot room
  replicates at most 4,096 entities and a seat holds at most 1,024–4,096 of them (fewer the more
  seats).
- Protocol 8: clients and servers of an older engine refuse each other (`E_VERSION`).
- A balancer holds `--max-conns` (10,000) connections at once, waiting players too, on its
  reactor threads. Tickets live in its memory, so a restart drops them (players rejoin).
- Phone builds link the match client when the project has a `multiplayer` block, but no match has
  been played on a device yet; an iPhone joining a server on the local network needs local network
  permission, which the iOS shell does not ask for yet (use a public server or the simulator).
- Replays and `--hash-trace` do not cover match steps yet, server events included.
- A notice reaches only players connected when it is sent; a turn match gets a server event only
  when it has started and the command names its room. Server tasks run only on authoritative servers.
- Hidden sets and snapshot sync need an authoritative server; hidden hands in turn games are not
  covered yet.
- A stored turn match comes back on the server's thread (about 0.2 ms each); a rejoining device
  still steps every turn from the first. Free-order turn matches have no turn limit, and server
  tasks see only the matches in memory.

Samples: `samples/rollback-arena` (real-time, authoritative), `samples/crowd-match` (one runner
per seat, 32 in input sync or 200 in snapshot sync).
