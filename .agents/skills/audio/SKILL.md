---
name: audio
version: 1.4.0
tier: required
description: Sound and music — decoded memory cost, .gmeta sound settings (codec, streaming, mono), banks and groups, PlaySound/PlayMusic timing, voice limits, audio budgets per device class. Use when adding sounds or music, when a sound plays late or not at all, when audio memory is over budget, or before shipping.
---

# Audio on phones

**Covers:** Sound and music on phones in Game Engine — what decoded audio costs (16-bit PCM at 48 kHz: 96 KB/s mono, 192 KB/s stereo) against cooked size, `.gmeta` sound settings (codec auto/opus/adpcm/pcm, stream_after, mono, bitrate, loudness/normalize, cooldown), streamed music and why it stays out of asset groups and banks, structuring banks and groups (boot vs level), PlaySound/PlayMusic timing (music waits, a sound trigger is dropped after 0.5 s), voice limits and stealing, audio budgets per device class (memory.budgets audio, `gameengine memory report`), memory warnings, and measuring the audio thread on a device (`gameengine device perf`). Use when adding sounds or music, when a sound plays late or not at all, when audio memory is over budget, or before shipping.

Design: `docs/design.md` § 7.4 (mixer, events, banks), § 7.1 (the audio importer), § 7.16 (groups
and budgets), ADR 0099. Audio is presentation: sim systems raise events (`PlaySound`, `PlayMusic`,
`StopMusic`, `SetBusVolume`, `LoadSoundBank`, `UnloadSoundBank`); the host plays them after the
step. Replays reproduce the triggers, not the samples.

**Sounds from presentation code** (menu clicks, feedback that follows what the sim already did):
`audio.play('audio/tap', { bus: 'UI', volume: 0.8 })` from `@gameengine/runtime`, in a UI
controller, a `LateUpdate` system or a `'foreground'` listener (it throws in a sim system; one
played on `'background'` waits for the app to come back, since no frame runs until then). It goes
straight to the mixer: never recorded, hashed or replayed, so adding one moves no pinned hash.
Button `sound`s take this path. Options and defaults match `PlaySound` (`bus` `SFX`, `volume`,
`pitch`, `pitchRandom`, `pan`, `priority`, `maxVoices`), with the same 0.5 s load wait; at most 64
a frame. Tests read them with `audio.sounds()`, not `world.events(PlaySound)`. A sound that is part
of the game's outcome or must replay exactly stays a `PlaySound` from the sim.

**A sound you keep changing** (an engine note that follows the speed, a hum that loops until
something stops it, a channel a newer sound cuts off): `const v = audio.voice('audio/engine', {
loop: true, volume: 0.5 })` from presentation code, then `v.set({ pitch, volume })` as often as the
state changes (the play position carries on: no restart, no click) and `v.stop()`. Keep the handle
in presentation state (a `sim: false` resource or the controller), never in the sim. Drive it from
sim state a `LateUpdate` system reads, so a replay sounds the same. At most 64 held voices at once;
a voice refused by voice limits, or one that ended, takes `set` and `stop` and does nothing.

## What a sound costs

| | Cooked (download, disk) | In memory while loaded |
|---|---|---|
| Short sound, `codec = "adpcm"` (the `auto` default under `stream_after`) | IMA-ADPCM at the source's rate: ~¼ of 16-bit | **decoded whole**: 16-bit PCM at the mixer's 48 kHz × channels = **96 KB/s mono, 192 KB/s stereo** |
| `codec = "pcm"` | 16-bit at the source's rate | the same decoded size |
| Streamed music, `codec = "opus"` (the `auto` default from `stream_after`, 10 s) | Opus `.lopus`, 64 kbit/s mono / 96 kbit/s stereo by default (`bitrate`) | **the cooked file only**: decoded a block at a time as it plays |

- Decoded size follows **length × channels**, never the cooked size or the source's sample rate: a
  22 kHz SFX decodes to 48 kHz like any other. To save memory, shorten, trim silence, or go mono.
- A 2 s stereo effect is 384 KB decoded; 100 such effects are 38 MB, more than the whole default
  `phone-low` audio budget (32 MB). The same set in mono is 19 MB.
- Decoding runs on the IO thread, never the frame thread, so a big file costs memory, not a hitch.

## `.gmeta` settings (`[settings]` of a sound's sidecar)

```toml
# assets/audio/coin.wav.gmeta
[settings]
mono = true          # SFX: almost always
cooldown = 0.08      # seconds between two starts of this sound
```

- `mono = true` downmixes at cook: half the bytes on disk **and** half decoded. Use it for every
  effect that is not deliberately stereo (UI clicks, hits, coins, voice lines). Keep stereo for
  music and wide ambiences.
- `codec`: `auto` (default: Opus from `stream_after` seconds, else ADPCM), `opus` (streamed),
  `adpcm`, `pcm` (16-bit, for a sound ADPCM audibly hurts: very quiet tails, pure tones).
- `stream_after` (seconds, default 10): where `auto` switches to streamed Opus.
- `bitrate` (bits/s, Opus only): default 96000 stereo, 64000 mono.
- `loudness` (LUFS, -60 to 0, default -16) and `normalize` (default true): the cook normalizes
  each sound, never past a -1 dBFS peak. Project defaults: `"audio": { "loudness": -16,
  "normalize": true }` in `project.gameengine.json`; a sound's `.gmeta` wins (`normalize = false`
  for a sound mixed by hand). `gameengine validate` reports bad values (`E_AUDIO`).
- `cooldown` (seconds, 0–3600): a start within that time of the sound's last start is dropped —
  landing thuds, cascades, many coins at once. It is a sound property, not a `PlaySound` field, so
  adding one changes no pinned hash.

## Music: streamed, and kept out of groups and banks

- Long tracks cook to streamed Opus and play through `PlayMusic` (Music bus, `crossfade`, `bpm` +
  `onBeat` for beat-synced changes). Only the file's bytes stay in memory while it plays.
- **Menu music from presentation code:** `audio.music('audio/menu_theme', { volume: 0.8, fade: 1.5 })` and
  `audio.stopMusic({ fade: 1 })` from a UI controller or a `LateUpdate` system: the same streamed path,
  crossfade and beat sync (`bpm`, `onBeat`) as `PlayMusic`, never recorded or replayed (they throw in a sim
  system). Music the game's rules start (a boss phase, a level's track) stays a `PlayMusic` from the sim.
- Do not list music in an asset group or a sound bank. The engine skips streamed members (it never
  decodes them ahead; `audio.status().banks.<b>.streamed` counts them), so a listing costs nothing
  today, but it reads as "this is preloaded" when it is not, and a track short enough to cook to
  ADPCM (under `stream_after`) *would* be decoded whole: 30 s of stereo is about 5.8 MB.
- Never play music with `PlaySound`: it decodes the whole file on demand (a 2-minute stereo track
  is 23 MB) and, being long to decode, usually misses its 0.5 s window anyway.
- A short jingle or sting that must start on an exact beat is an effect (`PlaySound`, ADPCM, in a
  bank); everything over a few seconds that loops or plays behind the game is music.

## When a trigger plays

- **`PlayMusic` waits for its file however long it takes.** A later `PlayMusic` replaces the
  waiting request (the latest wins); `StopMusic` cancels it and fades out what plays.
- **`PlaySound` waits at most 0.5 s** (wall time) for a sound that is not decoded yet, then is
  dropped with a log line (`audio`): it would play late. A first `PlaySound` of a sound in no bank
  or loaded group starts its read and decode then, so the first coin of a level can be silent on
  a slow phone. **Preload every effect before its first use**: list it in a bank that is loaded,
  or in the asset group loaded behind the level's loading screen. A loading cover waits for the
  loaded groups' sounds to finish decoding before it lifts (`loading.state().audioPending`, at
  most `maxWarmFrames`), so a group's effects are ready on the level's first step.

## Structuring banks and groups

A new bank (`*.bank.json`) or sound needs its `.gmeta` sidecar: write a bank with `gameengine cmd asset.setText` (it writes a new file under `assets/` with its sidecar) or run `gameengine cook` once after adding files, and commit the `.gmeta`; until then `validate` fails with `E_ASSET: no .gmeta sidecar`.

- **Boot bank** (`project.gameengine.json` → `"audio": { "banks": ["audio/core.bank"] }`, loaded
  at startup): only short sounds every screen uses — UI clicks, the common
  gameplay effects. Mono. Keep it small: it is resident for the whole session.
- **Level sounds** go in the level's asset group (`assets.groups.<level>.include`, skill
  `asset-memory`), or in a bank the level loads and frees (`LoadSoundBank` / `UnloadSoundBank`
  from a sim system on level start and end). The group or bank decodes them behind the loading
  cover and frees them when released (a sound another loaded bank lists stays).
- A bank file: `assets/audio/core.bank.json` → `{ "sounds": ["audio/swap", "audio/match"] }`,
  key `audio/core.bank`. `gameengine validate` checks its entries (`E_BANK`).
- **Memory warnings**: under critical or background pressure the engine frees decoded sounds that
  no voice plays, no trigger waits for and no loaded bank or group holds — sounds a `PlaySound`
  decoded on first use, members of released groups. They decode again on their next play (inside
  the 0.5 s window or dropped). Sounds that must never miss belong in a loaded bank or group.

## Voices and the mixer

- `PlaySound { maxVoices }` (default 4; 0 = unlimited) caps concurrent voices of that sound; at
  the cap a new start steals the oldest voice of equal or lower `priority`, else it is refused.
  Give rapid-fire effects a low `maxVoices` (2–3) and a `cooldown`; give important ones (a win
  sting) a higher `priority`.
- `audio.maxVoices` in `project.gameengine.json` caps all voices together, over every sound's own
  `maxVoices`; at the cap a new sound steals the oldest voice of equal or lower priority.
  `audio.overrides.<tier or class>.maxVoices` sets it per device:
  `"audio": { "maxVoices": 32, "overrides": { "phone-low": { "maxVoices": 16 } } }` (skill
  `device-tiers`).
- Every voice runs through its own resampler on the audio thread whatever its pitch, so `pitch`
  and `pitchRandom` add nothing; the **number of voices** is what costs. Many loops at once
  (ambience layers, engine hums) cost every audio period while they play.
- Buses: Master → Music, SFX, UI, Voice and project buses; `SetBusVolume` for volume and
  low/high-pass (muffle music under a pause menu).
- Phones run the device in miniaudio's conservative profile with 20 ms periods (AAudio usage
  `game`): about 50 mixer wake-ups a second instead of hundreds, at a few tens of milliseconds of
  latency, which casual feedback does not notice.
- **Silence costs nothing.** After a second with no voice, music or stream playing or waiting,
  the engine stops the output device, so a silent screen makes no audio callbacks. The next sound
  starts it again on the audio device thread (never the game thread) and plays from its first
  frame. Ambience loops that never stop keep the device running: give a quiet menu real silence.

## Budgets and checks

- `memory.budgets.<class>.audio` in `project.gameengine.json` (classes `phone-low`, `phone`,
  `tablet`, `desktop`; engine defaults 32, 48, 64 and 256 MB). A device whose GPU tier is
  `mobile` and which has at most 3.3 GB of RAM (Android) counts as `phone-low`.
- `gameengine memory report --device phone-low` sizes each group's sounds as decoded (seconds ×
  48 000 × channels × 2, from each sound's cooked `.audio.json`) and lists streamed music apart
  (0 resident). Exit 1 over budget. On Node before 22.15 it falls back to 4 × the cooked bytes.
- The report's always-resident row **`audio.banks (startup)`** is the boot banks' decoded size: it counts
  against every device class for the whole session, so it is the first place to cut.
- Running session: `gameengine call audio.status` (buses, voices, music, banks with `decoded` and
  `streamed`); `gameengine call profile.memory` for the audio total; in tests `audio.status()`.
- On a phone: `gameengine device perf --seconds 20` (Android, dev or probe build) prints CPU per
  thread; the audio callback thread should stay a few percent of one core. More means too many
  voices or loops, or a lot of Opus decoding (several streamed tracks crossfading).

## Before shipping

- [ ] Every SFX that does not need stereo has `mono = true`.
- [ ] Music and ambience over `stream_after` are streamed (`codec` auto or opus) and are in no
      group or bank; nothing plays music through `PlaySound`.
- [ ] Every effect is in the boot bank or the group/bank loaded before its level: no first-use
      decodes in play (a first `PlaySound` must not be the one that loads it).
- [ ] Rapid-fire effects have a `cooldown` and a small `maxVoices`.
- [ ] Loudness is consistent: the project's `audio.loudness`, no `normalize = false` without a
      reason.
- [ ] `gameengine memory report --device phone-low` passes, with the audio budget set in
      `memory.budgets`.
- [ ] `gameengine device perf` on a low-end Android probe build: audio thread CPU checked during
      the busiest scene.
