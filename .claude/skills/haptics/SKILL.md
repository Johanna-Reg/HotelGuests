---
name: haptics
version: 1.1.2
tier: optional
description: Haptics and vibration — haptics.json entries per platform, services.haptics.*, Button haptic=, the player's setting, the Haptics mode, E_HAPTICS. Use when adding or tuning a vibration, tap, rumble or game-feel feedback, when it feels wrong on iPhone or Android, or when porting Unity haptics.
---

# Haptics

**Covers:** Haptic feedback in Game Engine — named entries in haptics.json tuned per platform (strength and impact style for iOS, Android, desktop), services.haptics.play / impact / notification / selection / pattern, Button haptic= and ui.button defaults, the player's on/off setting and the repeat gap, how each platform plays a strength (iOS Taptic Engine and Core Haptics, Android Vibrator amplitudes and predefined effects, desktop gamepad rumble), the editor's Haptics mode, validate's E_HAPTICS, and what tests can and cannot prove. Use when adding or tuning a vibration, buzz, tap, rumble or "game feel" feedback, when haptics feel too weak or too strong on iPhone or Android, or when porting Unity haptics (Handheld.Vibrate, Nice Vibrations, Lofelt).

Haptics are presentation: call them from UI controllers, views and `LateUpdate` code, never from
a sim system (service calls throw in sim). A sim event ("MatchCleared") that presentation reacts
to is the usual shape.

## Name every haptic in `haptics.json`

The same effect feels different per platform: an iPhone's Taptic Engine plays a crisp, strong
tap, most Android motors a weaker, buzzier one. So each action gets a named entry, beside
`project.gameengine.json`, with a strength per platform:

```json
{
  "$schemaVersion": 1,
  "entries": {
    "match": { "effect": "impact", "style": "light", "note": "A plain match clears",
               "ios": { "strength": 0.7 }, "android": { "strength": 1, "style": "medium" } },
    "pick":  { "effect": "selection", "ios": { "strength": 0.8 } },
    "win":   { "effect": "notification", "type": "success" },
    "roll":  { "effect": "pattern", "note": "Long cascade",
               "pulses": [{ "atMs": 0, "durationMs": 40, "intensity": 0.4 }, { "atMs": 70, "durationMs": 40, "intensity": 0.8 }],
               "android": { "strength": 1 }, "ios": { "strength": 0.75 } }
  }
}
```

- `effect`: `impact` + `style` (`light` `medium` `heavy` `soft` `rigid`), `notification` + `type`
  (`success` `warning` `error`), `selection`, or `pattern` + `pulses` (1–32; `atMs` 0–10000,
  `durationMs` 1–5000, `intensity` 0–1). `note` is for people.
- Per platform (`ios`, `android`, `desktop`): `strength` 0–1 (1 = the platform's default feel,
  0 = nothing) and, on impacts only, `style` to play another style there. A platform left out
  plays strength 1 and the base style.
- Names start with a letter (letters, digits, `_ . -`, at most 64) and are never a preset name
  (`selection light medium heavy soft rigid success warning error`), because `haptic=` takes both.
- `gameengine validate` / `check` report mistakes as `E_HAPTICS` with the path
  (`entries.match.android.strength: must be a number from 0 to 1`); unknown keys are errors.
  JSON Schema: `docs/generated/haptics.schema.json` in the engine repo.
- The running game reloads the file when it changes (editor save, undo, an agent's edit).

## Playing them

```ts
import { services } from '@gameengine/runtime';
const buzz = (name: string) => void services.haptics.play({ name }).catch(() => undefined);
buzz('match');
```

```tsx
<Button id="pause" icon="ui/pause" haptic="button" onPress={() => intent('pause')} />
```

- `haptic=` on any pressable element (plays on press-down; `hapticOn="click"` on the completed
  tap) and `ui.button.haptic` in `project.gameengine.json` take an entry name or a preset.
- Presets and direct calls still work: `impact({ style })`, `notification({ type })`,
  `selection()`, `pattern({ pulses })`. They play strength 1 everywhere unless you pass
  `tuning: { ios: { strength: 0.7 }, android: { strength: 1, style: 'medium' } }` yourself;
  prefer an entry, which designers can tune without a code change.
- An unknown name rejects with `E_HAPTICS` (logged once). Catch rejections: haptics never matter
  to game logic.
- `services.haptics.supported()` → `{ haptics, patterns }`: hide the settings toggle where
  `haptics` is false.

## What the engine does before a platform plays

1. `play` looks the name up (a map built when the file loads) and becomes the entry's own call,
   with `tuning` filled for all three platforms. `services.calls` records that resolved call.
2. The player's setting: `services.haptics.setEnabled({ enabled })` / `isEnabled()`, answered by
   the engine and remembered across launches. While off, every call is dropped
   (`backend: 'haptics-off'`) and still resolves.
3. The repeat gap: the same kind (method + style or type) closer than 35 ms (patterns 120 ms) is
   dropped (`haptics-too-soon`), so a per-frame call cannot buzz nonstop. Different styles do not
   block each other. The same named entry (`play`) repeated within 100 ms plays once.
4. At most one haptic a frame reaches the device: a later call in the same frame plays only when
   it is stronger (selection < light/soft < medium/rigid < heavy < notification < pattern); the
   rest are dropped (`haptics-coalesced`). Fire haptics freely from cascades and combos: the
   engine keeps the device to one call a frame, and on Android the vibrator calls run off the
   game thread.
5. The platform's plugin plays it, reading only its own `tuning` key.

`haptics` is built into every Android and iOS build (ADR 0084); no `plugins` entry is needed and
`E_PLUGIN` never fires for it.

## Platform differences

| | iOS | Android | Desktop |
|---|---|---|---|
| Impacts | `UIImpactFeedbackGenerator(style)` (kept prepared), `impactOccurred(intensity: strength)` | API 30+ with hardware-tuned effects: `EFFECT_TICK` (light, soft), `EFFECT_CLICK` (medium), `EFFECT_HEAVY_CLICK` (rigid, heavy) at strength 1; otherwise, and always below strength 1, a one-shot (light 20 ms at 100, soft 30 ms at 80, medium 35 ms at 170, rigid 25 ms at 255, heavy 50 ms at 255 of 255) with amplitude × strength and the tap shortened to 60–100 % | gamepad rumble, motors × strength |
| Selection | `UISelectionFeedbackGenerator` at 1; below 1 a Core Haptics transient at 0.5 × strength | `EFFECT_TICK`, or 12 ms at 80, scaled like impacts | short rumble |
| Notifications | `UINotificationFeedbackGenerator` at 1; below 1 Core Haptics transients (two taps, three for error) × strength | waveforms: two taps (success, warning), three (error), amplitudes × strength | rumble taps |
| Patterns | Core Haptics continuous events, intensity × strength; nothing without Core Haptics | waveform, amplitude = intensity × strength × 255 | rumble per pulse |
| No hardware support | iPads and old phones: generators do nothing, Core Haptics is absent (`supported()` false) | no amplitude control: fixed amplitude, so strength only shortens taps (0 still silences); no vibrator: nothing, logged once | no pad: nothing; the editor and `gameengine test` only record calls (mock) |

- Android's default is the Vibrator as game usage, so the phone's "touch feedback" setting does not
  mute it. `"services": { "haptics": { "android": { "mode": "view" } } }` in
  `project.gameengine.json` plays the view's haptic feedback instead: the system's effect, silenced
  by that setting, faint on many phones, and it cannot scale (it plays unless strength is 0).
- Rule of thumb: start Android at 1 and iOS at 0.6–0.8 for taps a player feels often; use an
  Android `style` one step heavier when a light tap disappears on mid-range phones. Only real
  devices can confirm it.

## Tuning in the editor

Mode picker → **Haptics** (off by default: the user switches it on in the picker's Library): one row per entry with the effect, an iOS and an Android strength
slider (0–1, step 0.05) with a style override for impacts, add / rename / delete, and a play
button that sends `haptics.play` to the running game (Play mode) or the editor's scene session.
On a desktop session that is a mock (the status line says `played on: mock`); on a dev build on a
phone you feel it. Saves go through the command bus: undo works and the running game reloads the
file. Agents edit the same JSON; `gameengine validate` checks it.

## Testing

```ts
worldTest('a match plays the match entry, tuned per platform', async ({ step, services }) => {
  // … make a match …
  const p = services.calls('haptics.impact')[0]!.params as { style: string; tuning: Record<string, { strength: number; style?: string }> };
  expect(p.tuning.ios).toEqual({ strength: 0.7 });
  expect(p.tuning.android).toEqual({ strength: 1, style: 'medium' });
});
```

- Tests can prove: which entry played and when, each platform's resolved strength and style, the
  off switch, repeat gap and coalescing (`backend`: `haptics-off`, `haptics-too-soon`,
  `haptics-coalesced`), `E_HAPTICS`, and a build without the plugin
  (`services.mock('haptics.*', { error: 'E_UNAVAILABLE: …' })`; `setEnabled` / `isEnabled` keep
  answering). Each test starts with haptics on and no repeat history.
- Tests cannot prove how it feels. Strength, style and patterns must be felt on at least one
  iPhone and one mid-range Android phone.

## Checklist

- [ ] Every haptic the game plays is a named entry (`play` / `haptic="name"`), not an inline preset.
- [ ] iOS and Android strengths are set for each entry and felt on real devices.
- [ ] Calls come from presentation code and swallow rejections.
- [ ] The settings screen has a haptics toggle bound to `setEnabled` / `isEnabled`, hidden when
      `supported().haptics` is false.
- [ ] `gameengine check` passes (no `E_HAPTICS`), and a game test asserts the entries it relies on.
