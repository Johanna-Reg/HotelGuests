---
name: ship-web
version: 1.8.1
tier: optional
description: WebGPU browser builds — export a static game with gameengine build web, configure the Emscripten toolchain and hosting, and verify rendering, input, audio, saves and tab lifecycle. Use for web exports, browser deployment or browser-specific failures; playable ads use a separate build path.
---

# Shipping a browser game

`gameengine build web --project . --config release --out <build-dir>` exports `<build-dir>/site/`.
Serve that whole folder over HTTPS or localhost, with `.wasm` served as `application/wasm`.
The browser must support WebGPU. Ordinary folder exports need a server.

Add `--single-file` to embed the engine, wasm and cooked content into `site/index.html`.
That HTML needs no supporting files and can also be opened directly in a compatible browser.
It retains the selected dev/probe/release configuration and normal release gates; it cannot be
combined with `--dry-run`. Base64 embedding increases the uncompressed file size, and the whole
game must load before startup. Multiplayer still requires a server.

Single-file builds optionally accept `--compression none|gzip|brotli` (default `none`) and
`--max-size 10MB`. Binary files are compressed before base64 embedding; gzip uses native browser
decompression and Brotli embeds its own decoder with notices, without network requests.
`MB` is decimal, `MiB` binary. The size cap includes the final HTML, loader, decoder and branding;
exceeding it fails the build. Compression costs startup time and temporary memory, not gameplay work.

Save defaults under `build.web` in `project.gameengine.json`:

```json
{"build":{"web":{"singleFile":true,"compression":"brotli","maxSize":"10MB","loading":{"title":"My game","message":"Loading…","textColor":"#ffffff"}}}}}
```

CLI flags override these fields. `--compression` and `--max-size` require a single-file build.
`--single-file=false` selects a normal folder despite saved single-file settings;
`--max-size none` removes a saved size limit.
`--loading-title`, `--loading-message`, `--loading-background`, `--loading-text-color`,
`--loading-image` and `--loading-fit cover|contain` override the matching camelCase fields under
`build.web.loading`. Background/image/fit default to existing `branding.launch`; images are
project-relative PNGs embedded into the HTML. This startup presentation covers unpacking and
engine initialization, before engine views can run. It does not change gameplay loading views.
Compressed exports let the startup shell paint before unpacking. Background tabs do not wait
for a visible frame. The editor's **Build Settings → Web** keeps single-file and compression
choices visible, with size limits and startup styling under the collapsed **Advanced** section;
**Save and build** persists them before queuing the export. Web builds have no signing or store upload.

Restricted opaque-origin previews using `sandbox="allow-scripts"` automatically use
the engine's compatibility scope when a script iframe is inaccessible. Game globals, tool eval
and Math/Date/console guards stay separate from the player and reset with the runtime. Intrinsic
prototypes and browser objects remain shared, so this mode is for trusted engine bundles that
use engine APIs and do not modify prototypes. It is not a JavaScript security boundary.
The outer host's sandbox stays unchanged. Do not add `allow-same-origin` to untrusted uploads on
an authenticated host. Normal browser pages and Node still use separate realms. For example, in Cortex,
**Settings → Force view as blob → Open to interact** remains an optional separate-tab route.

This currently requires an engine source checkout. It builds the Rust/C++ engine for `wasm32-unknown-emscripten`. Scripts run on the browser's
own JavaScript engine. The canvas uses the same renderer, materials, physics and animation
as native players. No native process or video stream is needed. Playable ads remain a
separate, smaller export through `gameengine playable build`.

## Toolchain and build

Install and activate Emscripten 6.0.10 using the official emsdk, and install the pinned Rust
toolchain's `wasm32-unknown-emscripten` target. Set `GAMEENGINE_EMSDK` to the activated SDK
directory to select its compiler without changing PATH. The CLI also accepts a normally
configured Emscripten environment. `gameengine build web --dry-run` cooks content and assembles
the shell without compiling the runtime. Its report explicitly marks the missing runtime.

The web texture family uses universal UASTC, transcoded to a format the adapter supports.
`settings.platform.web` and `textures.platform.web` select its cook settings. Keep existing
GPU-tier and memory-class overrides for cheaper materials, meshes and post processing.
The browser renders at up to twice CSS pixel size and never above 8192 pixels per dimension.

Release builds use the normal pipeline gate, remove service mocks and leave cheats out unless
explicitly enabled. Build checks and pre/post/failure steps run with `build.platform === 'web'`.
Build outputs and reports are separate from the game source.

## Browser behavior

The loading screen prepares the engine before enabling Start game. The click unlocks WebAudio.
Mouse, touch, pointer capture, keyboard codes, typed characters and normalized wheel deltas
reach the existing input system. Coordinates are logical canvas pixels, independent of pixel
density. `services.system.setMouseCapture({ enabled })` uses the browser pointer lock (mouse-look):
the lock is taken on the next click, Escape releases it and reaches the game as an Escape key, and
the next click locks again while the game still wants it. It answers `captured: false` only where
the browser refuses the lock (a sandboxed frame), so keep a drag fallback. Losing focus cancels held controls. Input queues are bounded and reset after overflow.

Hidden tabs stop simulation and rendering. Returning starts a new frame clock, so time away is
not simulated. Saves use IndexedDB through IDBFS and are isolated by game identity and origin.
Keep a stable bundle ID across versions. If storage is denied the session still runs, but its
saves are temporary. IndexedDB persistence is asynchronous and browser eviction remains possible.

GPU requests yield through Asyncify. The shell serializes engine calls while they are suspended.
Game Promise continuations run at engine checkpoints, so an awaited service can call another
host API safely. The exporter includes the pinned Promise runtime and its license, including
inside single-file HTML. Keep these files when deploying a normal multi-file export. Do not
replace the game realm's Promise with the page's native Promise. Each realm holds up to 4096
library jobs and drains up to 1024 per checkpoint; overflow stops the realm explicitly at the
next checkpoint, and a reset discards pending jobs.
This is a single-threaded build; glyph misses and asset decodes run inline. Cook the required
font charset and keep initial content small to avoid long loading frames.

## Verification and limits

- Run game tests on native V8 and Hermes, plus `gameengine test --js v8,web --tier t0` for wasm parity.
- Export a probe build, load it in a real browser, press Start game and inspect rendered frames.
  Test drag, wheel, keys, resize and hiding/returning to the tab. Check the browser console for GPU errors.
- Probe/dev pages expose `gameengineProbe.state()` with rendered frame count, sim step and hash.
  It returns null while an engine call is running. Measure frame-count change over elapsed time;
  requestAnimationFrame's configured frequency does not prove the game rendered that fast.
- The engine repo's explicit `pnpm test:web -- <site-dir>` runs a headless browser smoke test.
  Set `GAMEENGINE_E2E_DIR` to an isolated scratch directory before running it.
- For a self-contained file, separately run `pnpm test:web:single-file -- <index.html>` in the
  engine repo: startup, input, offline use, restricted previews and restarts. Browser verification
  is not an implicit build step and requires an installed Playwright Chromium.

## Multiplayer invitation links and game UI

Enable the built-in `system` plugin and call `services.system.launchLink()` from a presentation
controller to read the browser document URL. It uses the same API as native deep links. The URL is
passed unchanged before engine creation, bounded to 8192 UTF-8 bytes. Restricted embedded documents
receive their own document URL. Browser system methods other than `launchLink` answer `E_UNAVAILABLE`.

Games own player-name entry, room and lobby screens, validation and interpretation of invitation
links. The engine launcher has only its generic startup controls. It does not collect game values
or rewrite URL parameters. Browser game scripts have no DOM or guaranteed `URL` global, so parse
links with a portable JS helper. Emit recorded input if the validated values affect sim state.

The engine repo's explicit `pnpm test:web:launch-link` builds a generated 3D fixture and verifies
unchanged launch URLs in normal, single-file and opaque embedded exports, with no game-entry form
in the engine launcher. Set `GAMEENGINE_E2E_DIR`; `GAMEENGINE_E2E_ARTIFACTS` retains screenshots,
videos and logs. Native parity also runs when both host paths are configured.

## Browser networking

Complete JSON snapshots should enter sim through an empty event marker with
`emitInputData(marker, encodedJson)` and `ctx.inputData<T>(marker)`. Validate the payload first and
keep the marker in the receiving system's events/run condition. A typed event string field
would retain every unique packet in the world's string table. The transient-data queue has
its own bounds; see `sim-boundaries`, Large external results.

Project-owned servers use the same `gameengine.net.websocket(url, options)` API as native players.
Use `wss://` from an HTTPS page. Custom headers answer `E_UNSUPPORTED`; use cookies or subprotocols
according to the server's authentication contract. Do not put a server secret in the game.
Browser HTTP fetch/download still answer `E_UNAVAILABLE`.

The configured engine `multiplayer` block uses the existing `multiplayer.join/status/events/setInput`
API, match server and balancer protocol. Browser and native clients can share relay or authoritative
matches, with input, snapshot or turn sync. Import `multiplayer` from `@gameengine/runtime`; the
transport needs no game-owned WebSocket or JSON snapshot bridge. Browser builds use binary packets
below the shared match client, and buffer the initial hello until the socket opens. Matchmaking
redirects retain the same transport owner. Use the same game build identity across targets.
Player names, room/lobby screens and invitation parsing remain game code.

One active engine match has a separate socket owner and a reusable 256 KiB receive buffer. Before
open, at most 8 packets / 64 KiB wait; overflow or send backpressure closes the match with an explicit
error through multiplayer status/events. Leaving or disposing the session closes its socket.
A suspended tab can disconnect; preserve the seat token and rejoin according to the game's policy.
The engine repo's explicit `pnpm test:web:multiplayer` builds a generated fixture and runs a real
engine authoritative server with one native and one browser client, checking input and snapshot
sync. Set `GAMEENGINE_E2E_DIR` and `GAMEENGINE_HOST` to the compatible native host; artifacts are
retained under `GAMEENGINE_E2E_ARTIFACTS` when supplied.

Each session permits 8 sockets, 16 subprotocols per open and 256 KiB per message. Sends above the
1 MiB outgoing buffer cap per socket answer `E_BACKPRESSURE`. Close codes are 1000 or 3000-4999, with at most
123 UTF-8 bytes in the reason. Opening/close timeouts and failures settle through the existing
service promises; text and binary message order is preserved.

The receive queue is bounded to 256 events and 2 MiB of message payload. Overflow explicitly closes
the affected socket with code 1013 and `E_OVERFLOW`. The transport does not silently coalesce game
messages. On close, reconnect and request an authoritative resync according to your game's protocol.
Hidden or frozen tabs can disconnect; timers cannot guarantee continuous presence. Reset, replay,
session replacement and page disposal invalidate pending callbacks and close owned sockets.
The shared runtime also caps messages waiting for handlers across all sockets to 256 messages and
2 MiB of retained payload, counting text as two bytes per code unit. Attach handlers promptly; this
queue also closes explicitly on overflow instead of silently dropping application messages.
Attach `onmessage` and `onclose` in the same turn after awaiting the socket to retain early greetings.
A close-only consumer receives its terminal event after one checkpoint, with `E_UNREAD` if payload
was left unhandled. Existing transport errors take precedence over that diagnostic.

The engine repo's explicit `pnpm test:web:network -- <site-dir>` checks two compiled browser clients,
ordered text/binary data, rejected headers, connection failure, close and a paused receive overflow.
Set `GAMEENGINE_E2E_DIR` to an isolated scratch directory before running it.

A project's `native/` crate and its packages' Rust crates are linked into the browser player: the
export builds a `native-web-player` wrapper in the engine (Rust and Emscripten toolchains required) and its
`build-report.json` names the plugin under `nativeSystems`. `gameengine test --js v8,web` runs the same
crates on the wasm host. That Rust runs without threads (`std::thread::spawn` fails there: fall back to
the caller under `cfg(target_os = "emscripten")`) and cannot drive the GPU itself; dev and probe pages
show the linked plugin as `gameengineProbe.native`. `GAMEENGINE_NATIVE_SYSTEMS=off` exports the stock
player with every system's TypeScript twin. Transpiled systems keep their TypeScript in the browser
(ADR 0299). A browser that exposes WebGPU without a GPU adapter stops at launch with `E_WEB_ADAPTER`.
The export rejects native mobile plugins beyond the system launch-link subset and on-demand/HTTP
bundles with named errors. Initial in-app cooked content is downloaded before startup,
bounded to 512 MiB. Mobile keyboards, browser service plugins, native video, editor browser-build
integration and cross-browser hash lanes remain separate work. Do not substitute a native stream
when verifying a browser export. Design: ADR 0133 and design.md § 8.4a.
