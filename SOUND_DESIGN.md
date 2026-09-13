# Hearthside Poker sound design

All sound is original procedural synthesis in `game/audio.js`. There are no downloaded recordings, paid assets, cloud services, external libraries, or network requests. The game does not borrow music or sound effects from Balatro. Its shared design principle is tactile, musical feedback that follows the action.

## Palette

| Action | Sound |
| --- | --- |
| Hover / click | A quiet felt touch, then a rounded wooden button tap |
| Deal | A filtered paper swish, card-edge flutter, and soft landing |
| Flip | Two short paper movements and a tiny pitched edge snap |
| Chips / raise | Irregular ceramic chip collisions with three tuned resonances and a wooden body; raises add two warm ascending notes |
| Check | Two close, slightly different knuckle taps |
| Fold | A descending paper slide that settles softly |
| Your turn | A gentle two-note invitation |
| Open / close guide | A page-like sweep paired with rising / falling keys |
| Shuffle | An alternating stereo paper riffle followed by the deck settling |
| Win | A cascading F major ninth arpeggio, scattered chip clicks, and a warm closing chord |
| Lose | A soft settling chord; no buzzer or punishing alarm |

The background is an original 76 BPM arrangement of felted tine keys, sparse upper notes, a rounded bass, and brushed noise. Four extended chords repeat while the upper phrase changes across cycles. A quiet low-frequency hearth texture sits to the left and a filtered rain-like texture sits to the right, with occasional small crackles. Short stereo room reflections connect the effects and music without blurring card timing.

Pitch, velocity, and collision spacing vary slightly for repeated actions. Every transient has an envelope. The mix uses a high-pass filter, gentle compression, and a final limiter. Effects remain forward of the deliberately low music and ambience defaults. The controls fade smoothly instead of switching abruptly.

## Integration

Load `audio.js` as a classic script before the UI script. No module loader or build step is required.

```javascript
var audio = new HearthAudio();

// From the first pointer or keyboard gesture:
audio.init(); // Promise<boolean>; false means unavailable or resume was denied.
audio.play('deal', { pan: -0.35 });

audio.play('chips', { count: 5, pan: 0.25 });
audio.play('win', { intensity: 0.85 });
audio.setMaster(0.72);
audio.setMusic(0.19);
audio.setAmbience(0.16);
audio.setMuted(true);
audio.mute(); // Toggle; mute(true/false) also supported.

var savedSettings = audio.getSettings();
// Use new HearthAudio(savedSettings) if the UI persists preferences.
// Call audio.destroy() when permanently disposing the game view.
```

### Public methods

- `init()` creates the audio graph only once, resumes audio after a user gesture, and returns a promise. Repeated calls are safe. `play()` also calls it, so a direct click handler can simply call `play()`.
- `play(name, options?)` supports `hover`, `click`, `deal`, `flip`, `chips`, `fold`, `check`, `raise`, `win`, `lose`, `guideOpen`, `guideClose`, `shuffle`, and `turn`.
- `options.volume` is 0–1.5, `pan` is −1–1, `pitch` is 0.5–2, `intensity` is 0–1, `count` is 1–9, and `delay` is 0–1 seconds. `pitch` changes physical card/chip/tap sounds; musical cues keep their harmony. `intensity` extends the win flourish. `count` controls chip/raise collisions.
- `setMaster(value)`, `setMusic(value)`, and `setAmbience(value)` accept 0–1 and return the clamped value. Defaults are 0.72, 0.19, and 0.16.
- `setMuted(boolean)`, `mute(boolean?)`, and `toggleMute()` return the new muted state. Muting preserves volume settings.
- `getMaster()`, `getMusic()`, `getAmbience()`, `isMuted()`, and `getSettings()` return current preferences. The `master`, `music`, `ambience`, and `muted` properties are also readable and writable.
- `available` reports whether Web Audio can be initialized. An unsupported or unavailable audio device does not block gameplay.
- `destroy()` stops voices and loops, clears the scheduler, removes the visibility listener, and closes the context. Create a new instance to restart after destruction.

## Runtime behavior

The implementation uses standard Web Audio with a `webkitAudioContext` fallback and gracefully omits stereo panning if the embedded Chromium version lacks `StereoPannerNode`. A click/key gesture is needed before Chromium permits audible playback. The first Deal button should call `init()` directly from its event handler.

A 100 ms scheduler queues only 220 ms of music. A delayed frame never generates a backlog of notes. At most 128 short sound sources can be live at once; sources disconnect themselves when finished. Ambience uses two reusable, crossfaded noise loops. Hidden documents fade to silence and stop scheduling new sound effects and music. Returning to the game resumes from a near-future beat. Muting skips new one-shot and musical voices and smoothly silences the whole graph.

For physical action timing, trigger `deal` at the start of card movement (the landing is built into the sound), `flip` at the start of the flip, `chips` when a chip stack starts moving, and `check` when the check action is accepted. Trigger `win` only after a resolved hand. Keep guide sounds available while the guide animates open or closed.

Every sound can be generated entirely offline by the embedded browser. No asset attribution or additional sound licensing is needed for these original synthesizers and their original musical phrase.


## Silent startup preparation

`HearthAudio.prepare()` can run during initial loading. It opens and suspends the audio device and prepares the existing graph and exact original buffers. It starts no sources, music, ambience loops or scheduler. `init()` remains the gesture entry point: it requests resume immediately, waits safely for any pending suspension, and activates the loops once. The first few effects may wait in a bounded queue while activation completes; hidden, failed or disposed instances never replay them later. Visibility alone cannot activate prepared audio. See PERFORMANCE.md for measured first-click improvements and their startup-time tradeoff.
## Four-track music and interactive tea

The music now includes four original procedural compositions: Windowlight (76 BPM), Cedar Steps (68 BPM), Rain on the Roof (72 BPM), and Last Ember (62 BPM). Each has its own chord progression, melody and rhythmic pattern. The default playlist rotates about every 1.7–2.1 minutes with a short rest between tracks. Settings → Sound & motion → Music selects the playlist or repeats one track; the choice saves locally.

Click the teacup, or focus it and press Enter/Space, for an equal chance of a quiet ceramic stir or a subtle sip. A one-second cooldown prevents stacking; mute/master volume and Gentle motion are respected. Both effects are original synthesis with no downloaded samples or services.

Validation: all four arrangements and both tea cues rendered in the native Chromium OfflineAudioContext. Peaks stayed below 0.08 and rendered tails reached silence. A trusted native pointer click triggered the tea animation and audio, and all four playlist slots were verified. 77 automated tests pass, including audio preparation and screenshot-specific hand regressions.

## Companion reactions

Six original quiet hover cues: fox paw taps, moth flutter and high note, frog croak, crocodile low tap, axolotl bubbles, and dog vocal sound. The rare spinning-cat event uses an original synthesized trill. All seven cues rendered in the native audio engine with nonzero output, peaks below 0.054 and silent tails. Hover sounds have a shared cooldown and obey master/mute controls. No reference-video soundtrack is included.

## Hand review and hover sound refinement

The hand-review dialog now keeps its Deal next hand (or A fresh table) button beside the heading. Only the pot/result list scrolls, so continuing never requires scrolling to the bottom. The action closes the dialog before starting play.

Hover cues were reviewed and retuned as quiet original synthesis: Juniper has three soft chitter pulses; Luna has airy wing flutters instead of a musical note; Moss has a pulsed low croak; Clipper has a restrained low huff with a quiet wooden tap; Baron has a soft descending woof. Mur retains the short aquatic bubble sequence. Existing volume, pan, mute and cooldown settings remain effective.

Validation: 101 automated checks passed. Native QA expanded the review into a long scrolling list, verified that the button stayed fixed and visible, and started the next hand from that button. Offline audio rendering checks cover every hover cue plus the cat trill, checking finite output, audible energy, peak headroom and quiet tails. These are stylized synthesized cues, not field recordings.
