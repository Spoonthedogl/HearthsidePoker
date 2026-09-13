# Hearthside — Code Audit

Audited at `f0cb113`, 2026-09-13. Reviewed by reading every JavaScript module in
`game/`, the UE5 host in `Source/`, the stylesheets, and the test suite, plus
running the game in a browser at desk and phone sizes.

---

## 1. Current state

### What this project actually is

The game is a **dependency-free HTML/CSS/JavaScript application** in `game/`.
The Unreal Engine 5 project around it (`Source/`, 545 lines of C++) is a host
that opens a CEF browser view and exposes a window/display bridge
(`window.ue.hearthdisplay`, consumed by `game/display.js`). No gameplay lives in
C++. That means the web build and the Windows build are the same program, and a
defect in `game/` ships to both.

### Build, run, test

| | Command | Result |
|---|---|---|
| Build (game) | none — static files | n/a |
| Build (Windows host) | `Package Game.ps1` | **not run** (see below) |
| Run | `python -m http.server 8731 --directory game` then open `localhost:8731` | starts, reaches the table, plays |
| Test | `node --test game/tests/*.test.cjs` | **110 pass, 0 fail, 1.58s** |

I did **not** re-run the UE5 package. It needs the installed engine and takes
tens of minutes, and the existing packaged output in
`../HearthsidePoker-Windows/` is current. So I have **no compiler warning
baseline for the C++ host** — that gap is real and I have not closed it.

### Baseline numbers

| Metric | Value | How measured |
|---|---|---|
| Shipped web payload | **17 MB** (`game/`, excluding tests) | `du -sh` |
| — of which art | 14 MB (10 PNGs) | `du -sh game/assets` |
| — of which `clipper-mask.css` | **2.4 MB** (one base64 PNG, one rule) | `wc -c` |
| — of which all JS + other CSS | ~200 KB | `ls -la` |
| Session save payload | **11.1 KB**, rewritten on essentially every game event | `localStorage.getItem(...).length` in page |
| localStorage write cost | <0.1 ms per write, desktop | patched `Storage.prototype.setItem`, timed |
| Ambience canvas buffer | 720×450 desk / 384×704 portrait | read `canvas.width` in page |
| Dust-mote canvas buffer | 1440×900 desk / 768×1408 portrait | read `canvas.width` in page |
| Test suite | 110 tests, 1.58 s | `time node --test` |
| Tracked repo files | 105 | `git ls-files` |

### Frame time

**Not measured — needs measurement.** The browser pane throttles
`requestAnimationFrame` when hidden, and I could not get a clean rAF sample. All
performance findings below are marked either *measured* or *static analysis
only*. I have not run this on a real phone.

### Test coverage, honestly

The 110 tests are good where they exist: rules, hand evaluation vs. an
independent evaluator, side pots, session pack/unpack, seating geometry for both
layouts, the club fund, companion dialogue, AI behaviour.

They cover **none of `app.js`** — 48 KB and 177 lines containing the entire game
loop, state machine, save orchestration, rendering and input handling. Also
untested: `audio.js`, `ambience.js`, `display.js`, `roster.js`. Every defect in
the High/Medium list below lives in that untested region. That is not a
coincidence.

---

## 2. Executive summary — the five that matter

1. **A saved evening is destroyed by any rebuy.** `session.js:11` asserts that
   the chips on the table equal `players × 500`, but the app injects a fresh
   stack whenever anyone busts. After the first bust of the night — common — the
   save silently fails to load and the player restarts the evening at hand 1,
   losing their progress toward the club fund. Reproduced. This is the worst bug
   here and it attacks the exact feature that gives the game its stakes.

2. **2.4 MB of the 17 MB download does nothing.** `clipper-mask.css` is a single
   rule holding one base64 PNG. `seating.css:5` overrides it to
   `mask-image: none` with higher specificity, so no sprite on the page uses it —
   verified in the browser (`anyCharacterUsingMask: 0`). The browser still
   downloads, parses and decodes it, in a render-blocking `<link>`. Deleting the
   file is a one-line change.

3. **The phone layout has hardcoded desk coordinates left in it.** Chip-flight
   and win-burst particles fly to and from fixed points in the 1440×900 design
   space (`app.js:74`, `app.js:106`). In the 768×1408 portrait space those are
   the wrong places entirely. This is the concrete half of the "mobile UI
   scaling" you suspected — the layout itself is fine, the effects are not.

4. **Save/Load and Quit don't mean what they say.** "Load" is
   `location.reload()` (`app.js:155`); there is no save slot, only one
   continuously-overwritten autosave, so "Save" and "Load" cannot do what a
   player expects. "Save & quit" always saves and has no counterpart — your
   request for an isolated quit is not a gap in polish, it's the missing half of
   a pair.

5. **The untested half is the buggy half.** Every finding above sits in
   `app.js`, which has no tests at all. Before fixing much else I would put a
   save/load round-trip test and a rebuy test around `session.js` and the evening
   counters — that alone would have caught finding 1.

Nothing here is Critical. The game does not crash, corrupt the club fund, or
block play. It loses an evening, ships dead weight, and misleads the player in a
few places.

---

## 3. Findings

| ID | Sev | Location | Summary |
|---|---|---|---|
| BUG-01 | High | `game/session.js:11` | Saved hand rejected after any rebuy; evening progress lost |
| PERF-01 | High | `game/clipper-mask.css`, `game/index.html:2` | 2.4 MB render-blocking stylesheet that no element uses |
| BUG-02 | Medium | `game/app.js:74,106` | Particle effects use desk coordinates in the portrait layout |
| BUG-03 | Medium | `game/app.js:155` | "Load" is a page reload; Save/Load imply slots that don't exist |
| BUG-04 | Medium | `game/app.js:121`, `game/display.js:12` | No quit-without-saving; browser quit only writes a status line |
| PERF-02 | Medium | `game/app.js:170` | Dust-mote loop never pauses — runs behind modals, on the menu, and in gentle mode |
| ARCH-01 | Medium | `game/app.js:114` ↔ `game/poker.js:489` | App clears `table.events`; the AI derives raise counts from it |
| TEST-01 | Medium | `game/app.js` (all) | 48 KB of game loop, state and save orchestration, zero tests |
| SEC-01 | Medium | `Config/DefaultEngine.ini:27-30` | Android File Server plugin enabled with a committed token, on a Windows-only game |
| HYG-01 | Medium | repo root | ~33 MB tracked that nothing at runtime uses; build logs tracked; no CI |
| PERF-03 | Low | `game/app.js:104` + `game/seating.css:24` | Per-action badge built and animated into a `display:none` element |
| QOL-01 | Low | `game/style.css:1`, `game/index.html:6-7` | Whole secondary-label tier is 9–10 px with 2–4 px tracking over photographic art |
| BUG-05 | Low | `game/computation.js:92` | One slow analysis permanently disables the worker for the session |
| BUG-06 | Low | `game/app.js:20,133` | `handStartStack` hardcoded to 500 alongside `table.startingStack` |
| BUG-07 | Low | `game/app.js:164` | Hover sound fires on every touch tap |
| BUG-08 | Low | `game/app.js:159` | Volume sliders write localStorage on every input event |
| SEC-02 | Low | `game/session.js:4` | Opponents' hole cards and the undealt deck sit in cleartext localStorage |
| BUG-09 | Low | `game/app.js:86` | Possible crash on a hand-edited save — **not reachable in normal play** |
| HYG-02 | Low | `game/app.js:52,138,175` | `console.info` / `console.warn` ship in release |
| SUG-01…08 | Suggestion | various | Your seven items plus three of mine — see §3.3 |

### 3.1 High

---

**BUG-01 — A saved evening is destroyed by any rebuy** · `game/session.js:11`

`unpack()` validates a restored table with:

```js
if(t.players.reduce((n,p)=>n+p.stack+p.totalBet,0)!==t.players.length*500)
  throw Error('Saved chip totals are inconsistent.');
```

Total chips are asserted to be a constant. But the app injects chips on rebuy —
`app.js:114` gives every busted companion a fresh `table.startingStack` at the
start of each hand, and `app.js:123` does the same for the player. After one
bust the table legitimately holds 2500 chips, not 2000, and the check throws.

**Reproduction** (`node`, against the shipped modules — all-in every hand until a
seat busts, then apply the app's own rebuy):

```
Played 1 all-in hands; seat 1 (Juniper) is out of chips.
Table still holds 2000 chips - nothing created, only moved.
  before any rebuy           chips=2000  -> save loads OK
  after a companion rebuys   chips=2500  -> SAVE REJECTED: "Saved chip totals are inconsistent."
```

**What the player sees:** nothing. `app.js:52` catches the throw, sets
`restore=null` and emits a `console.warn`. The button reads "Take a seat"
instead of "Return to the table". Lost with the hand is the whole `ui` block —
`eveningHands`, `buyIns`, `eveningClosed`, `eveningEarned`, `record` — so the
evening restarts at hand 1 and the fund contribution for those hands is gone.
The club fund itself is a separate key and survives.

**Fix:** the check exists to catch tampering, so replace it rather than delete
it. Persist `startingStack` (it isn't in the `fields` list at `session.js:4`)
and the injected total, then assert against `players × startingStack +
injected`. Effort **S**. **Risk of fixing: low**, but it is save-format-adjacent
— bump the save version and let old saves fail cleanly rather than silently
mis-validating. Needs a regression test.

---

**PERF-01 — 2.4 MB of dead, render-blocking CSS** · `game/clipper-mask.css`

The file is one rule, one line, 2,486,766 bytes:

```css
.companion[data-character=clipper] .sprite{-webkit-mask-image:url(data:image/png;base64,…)}
```

`seating.css:5` sets `-webkit-mask-image:none;mask-image:none` on
`#stage .seated-companion .sprite`. Specificity 120 vs 30, so the mask never
applies. Every companion element gets `companion seated-companion`
(`roster.js:14`), so there is no code path where the rule wins.

**Verified in the browser:**

```
clipperSheetLoaded: true, clipperRules: 1
maskImage: "none", anyCharacterUsingMask: 0
```

It is a `<link>` in `<head>` (`index.html:2`), so it blocks first render while
the browser downloads 2.4 MB and decodes an ~1.8 MB PNG. That is 14% of the web
payload and it is pure waste — and it now matters more, because the game is
published as a web page people open on phone data.

**Fix:** delete the file and its `<link>`. If the mask is wanted again later it
belongs as a real PNG in `assets/`, not base64 in CSS. Effort **S**.
**Risk: low** — but confirm on the desk build that Clipper's sprite is unchanged,
since I verified the override in the browser, not in the packaged CEF host.

### 3.2 Medium and Low

---

**BUG-02 — Particle effects use desk coordinates in portrait** · `app.js:74,106`

`chipFlight()` flies chips from `[720,780]` for the player and toward
`(755,483)`; `burst()` fires at `(720,714)` or `(…,425)`. All four are points in
the 1440×900 desk space. The portrait stage is 768×1408, where the pot sits at
roughly `(384,440)` and the player's cards at `(384,872)`.

Opponent origins are fine — `seatPoint()` reads `dataset.chipX/chipY`, which
`roster.js` writes from the active seat variant. Only the player's origin and
both destinations are hardcoded.

**Trigger:** play any hand on a phone-width viewport; chips fly toward the right
edge instead of the pot. **Fix:** move the four constants into
`HearthSeating.STAGE` alongside the seat geometry and read them via
`seatVariant()`. Effort **S**. **Risk: low**.

---

**BUG-03 — "Load" is a page reload** · `app.js:155`

```js
else if(id==='loadGame'){location.reload();}
```

`Save` calls `checkpoint()`, which is the same autosave that already runs on
every event. There is only one slot and it is continuously overwritten, so
"Save" changes nothing a player can observe and "Load" restores whatever the
autosave happened to hold — not the state they pressed Save on.

**Trigger:** press Save, play three more hands, press Load. You get the latest
hand, not the saved one. **Fix:** either make Save write a genuine second slot
that Load restores, or drop both buttons and label the autosave honestly. That
is a product call — see OQ-2. Effort **M** for real slots, **S** to remove.
**Risk: low**, but touches save behaviour players may rely on.

---

**BUG-04 — No quit without saving** · `app.js:121`, `display.js:12`

```js
function quitGame(){saveSession();if(saveFailed)return;if(window.hearthDisplay)window.hearthDisplay.quit();}
```

Save is unconditional and there is no second path. In the browser
`hearthDisplay.quit()` writes "Your hand is saved. You can close this browser
tab." into `#saveStatus` inside the settings panel — so on the web the button
does nothing except leave a line of text. This is your item 7, and it is really
two things: a missing discard-and-quit action, and a quit button that is inert
on the platform you just published to. Effort **S** for the discard path.
**Risk: low** — but discarding is destructive, so it needs a confirmation.

---

**PERF-02 — The dust-mote loop never stops** · `app.js:170`

```js
function frame(){requestAnimationFrame(frame);if(++frames%2||$('reducedMotion').checked||document.hidden)return;
  ctx.clearRect(0,0,cv.width,cv.height); … }
```

The loop is scheduled unconditionally forever. It has no pause check, so it runs
behind every modal, on the title screen, and while the hand journal is open. On
every second frame it clears the full stage canvas — 1.08 M pixels in portrait —
and paints 24 two-pixel rects, ~30×/second, for the life of the tab. It also
reads `getElementById('reducedMotion').checked` 60×/second.

Two smaller bugs fall out of the same line: in gentle mode it returns *before*
`clearRect`, so the last frame of motes freezes on screen rather than clearing;
and the `setInterval` at `app.js:172` likewise never stops, ticking companions
and the cat 12.5×/second on the menu.

**Static analysis only — I have not measured the frame cost on a device.** The
work is small per frame; the objection is that it is unbounded and runs when
nothing is visible, which is a battery cost on the phone build. **Fix:** bail out
of the rAF loop when `paused()` or `document.hidden`, clear once on entering
gentle mode, and cache the `reducedMotion` element. Effort **S**. **Risk: low**.

---

**ARCH-01 — The app clears state the AI reads** · `app.js:114` ↔ `poker.js:489`

`app.js:114` does `table.events=[]` — reaching past the Table's API into a field
the engine owns. `poker.js:489` (`chooseAIAction`) walks that same array to
derive `streetRaiseCount` and `ownRaiseCount`, which gate whether a companion
may raise at all (`poker.js:263`).

Today it is safe: the clear happens immediately before `table.newHand()`, so no
in-hand history is lost. But the two are coupled invisibly across a module
boundary, and if that clear ever moved inside a hand, every companion would
silently forget it had already raised. No test would catch it.

**Fix:** give `Table` a `resetEvents()` (or clear in `newHand()`) and have the AI
track raise counts in hand state rather than by replaying the log. Effort **M**.
**Risk: medium** — it changes AI inputs, so it needs the AI behaviour tests green
before and after, and it should be a separate commit from any bug fix.

---

**TEST-01 — `app.js` has no tests** · `game/app.js`

177 lines, 48 KB, longest line 1621 characters. It owns the game loop (`drive`),
the state machine (`started`/`joining`/`busy`/`revealed`/`eveningClosed`), all
save orchestration, all rendering and all input. No test file references it.
BUG-01 through BUG-04 all live here.

Much of it is untestable as written because it closes over module-level mutable
state and touches the DOM directly. The cheapest useful change: extract the
evening bookkeeping (hand counting, buy-ins, take-home, the `eveningClosed`
latch) into a pure module beside `club.js`, and test it. See §5 for the test set
I would write. Effort **M**. **Risk: low** if extraction is mechanical.

---

**SEC-01 — Committed token and an enabled plugin you don't use** ·
`Config/DefaultEngine.ini:27-30`

```ini
[/Script/AndroidFileServerEditor.AndroidFileServerRuntimeSettings]
bEnablePlugin=True
bAllowNetworkConnection=True
SecurityToken=<32-hex value, redacted>
```

This is Unreal's Android File Server — an editor plugin for pushing files to a
device over USB/network during development. The token is engine-generated, not a
credential to any external service, and `bIncludeInShipping=False` /
`ConnectionType=USBOnly` keep it out of shipped builds. So: **not an emergency,
and I have committed nothing.**

It is still a token in a public repo, for a plugin enabled on a Windows-only
game that will never target Android. **Fix:** disable the plugin
(`bEnablePlugin=False`) and drop the block; rotate the token if the plugin is
ever wanted. Effort **S**. **Risk: low** — verify the editor still opens.

---

**HYG-01 — ~33 MB tracked that nothing uses; no CI** · repo root

- `unused-assets-archive/` — **20 MB**, 16 tracked files, named for what it is.
- Seven root preview PNGs (`Preview.png`, `art-quality-preview.png`, …) — **11 MB**.
- `clipper-mask.css` — 2.4 MB (PERF-01).
- `Build/Windows/FileOpenOrder/*.log` — build output, tracked; `.gitignore`
  covers `Binaries/ Intermediate/ Saved/ DerivedDataCache/` but not `Build/`.
- No `.github/workflows`. The 110 tests run only when someone remembers.
- No `package.json`, so there is no `npm test`; the command lives in the README.

**Fix:** delete or LFS the archives, add `Build/**/*.log` to `.gitignore`, and add
a CI job that runs `node --test game/tests/*.test.cjs` on push — the suite is
1.6 s, there is no excuse. Effort **S**. **Risk: low**, but `git rm` on 31 MB
rewrites nothing historical unless you ask for it, and the history keeps the
bytes either way.

---

**PERF-03 — Work built for an invisible element** · `app.js:104`, `seating.css:24`

On every action the app creates or reuses a `.bet-feedback` div, sets text,
strips a class, forces a synchronous reflow (`void badge.offsetWidth`), sets a
custom property and re-adds the class. `seating.css:24` is
`#stage .seated-companion .bet-feedback{display:none}` — and every companion is
a `seated-companion`, so it is never visible. The comment there says the
nameplate already announces the bet, which is true; the code that feeds the
hidden element was left behind. Effort **S** to delete. **Risk: low**.

---

**QOL-01 — The secondary-label tier is too small** · `style.css:1`, `index.html:6-7`

Measured in-page at the game's native 1600×900 (stage scale 1.0):

| Element | Declared | On screen | Tracking |
|---|---|---|---|
| `.brand p` "WOODLAND POKER CLUB" | 10 px | 10.0 px | 3.8 px |
| `.session-info` | 10 px | 10.0 px | 1.2 px |
| `.wallet .eyebrow` | 9 px | 9.0 px | 2 px |
| `.your-label` | 9 px | 9.0 px | 2 px |
| `#handSource` | 10 px | 10.0 px | — |
| `footer button` | 10 px | 10.0 px | — |

On a 1366×768 monitor the stage scales to 0.853 and these become 7.7–8.5 px. In
the portrait layout the brand tagline renders at **6.3 px** and the session line
at **8.7 px** (measured at stage scale 0.482).

Contrast against the darkest room tone is fine (7.5–9.1:1), but all of these sit
over *photographic* background art with lanterns and firelight behind them, so
effective contrast swings widely across the string. This is your item 4, and it
is systemic rather than one line. **Fix:** lift the tier to 12–13 px, cut
tracking to ≤1.5 px, and add a soft dark plate behind the header text. Effort
**S–M**. **Risk: low**, but it is a visual-identity change — your call, not mine.

---

**BUG-05 — One slow analysis kills the worker for the session** · `computation.js:92`

The worker watchdog is `max(100, workerTimeoutMs || 1500)` ms. On timeout
`_workerFailed()` sets `this.workerBlocked = true` permanently, and every later
analysis runs chunked on the main thread. A 12,000-sample preflop analysis on a
slow phone can plausibly exceed 1.5 s, and the fallback is correct but
main-thread. **Not observed — static analysis only; I did not run this on a slow
device.** **Fix:** treat a timeout as a one-off (retry once, back off) rather
than latching. Effort **S**. **Risk: low**.

---

**BUG-06 — `handStartStack` hardcoded** · `app.js:20,133`

`var …,handStartStack=500` and `reset()` sets `handStartStack=500`, while the
real value is `table.startingStack`. Identical today, so no live bug; it silently
breaks the win/loss record and the evening take-home the moment the buy-in
changes. `session.js:11` hardcodes the same 500 (BUG-01). **Fix:** read
`table.startingStack`. Effort **S**. **Risk: low**.

---

**BUG-07 — Hover sound on touch** · `app.js:164`

`document.addEventListener('mouseover', …)` plays `hover` for any button. Mobile
browsers fire `mouseover` on tap, so every phone tap plays the hover cue *and*
the button's own cue. **Fix:** gate on `matchMedia('(hover:hover)')`. Effort
**S**. **Risk: low**.

---

**BUG-08 — localStorage write per slider tick** · `app.js:159`

The `input` handler calls `saveSettings()` for `masterVolume`, `musicVolume`,
`ambienceVolume` and `reducedMotion`. Dragging a volume slider fires `input`
continuously, so each drag is dozens of synchronous `JSON.stringify` +
`localStorage.setItem` calls. Measured cost per write is <0.1 ms on desktop, so
this is a papercut, not a stall. **Fix:** debounce to ~200 ms, or save on
`change`. Effort **S**. **Risk: low**.

---

**SEC-02 — The save reveals hidden information** · `session.js:4`

`fields` includes `players` (with every `hole`) and `deck`, so
`localStorage['hearthside-session']` holds all opponents' hole cards and the
entire undealt deck in cleartext for the duration of a hand. Restoring the hand
needs exactly this, so it is a design tradeoff rather than an accident.

Worth noting only because the rest of the codebase is scrupulous about it —
`chooseFairAction` is explicitly built so the AI never sees the deck
(`poker.js:222`), and the hand journal is documented as visible-information-only.
The save quietly undoes that guarantee for anyone who opens devtools. For a
single-player game with make-believe chips the impact is nil. **Fix:** none
recommended; note it in the design docs. Effort **S** if you ever want to
obfuscate. **Risk: n/a**.

---

**BUG-09 — Possible crash on a hand-edited save** · `app.js:86`

```js
$('currentHand').textContent = started ? (visibleBoard.length<3 ?
  (ev.category===1 ? 'Pocket '+(rank[table.players[0].hole[0].rank]…
```

`hole[0]` is dereferenced without a guard. It needs `started`, fewer than three
board cards, a pair, and an *empty* hole — which happens only if a hand starts
while the player is dealt out. **I could not reach this in normal play:**
`app.js:155` routes a busted player to `rebuy()` before any new hand, and
`reset()` deals everyone a fresh stack. `session.js:10` does accept a saved
player with `hole.length === 0`, so a hand-edited save could construct it.

Flagging as hardening, not a live defect. **Fix:** guard the dereference.
Effort **S**. **Risk: low**.

---

**HYG-02 — Console logging in release** · `app.js:52,138,175`

`console.info('Hearthside ready …')` on every load, plus `console.warn` for a
rejected save (the only trace BUG-01 leaves) and for a failed hand analysis.
Harmless, but the save warning should be player-visible rather than
console-only. Effort **S**. **Risk: low**.

### 3.3 Suggestions — your call

These are product decisions. I have not built any of them.

**SUG-01 — An action log** *(your item 2)*. Today the only running commentary is
`#tableMessage`, one line overwritten on every action (`app.js:104`), plus the
nameplate status and a `.bet-feedback` badge that is `display:none` (PERF-03).
Nothing scrolls back, and the recap modal shows only the final pots, not the
sequence. The data already exists — `table.events` carries every action with a
formatted `text` field — so this is a rendering job, not a modelling one. Effort
**M**. It is the single change that would most improve being able to follow a
hand, and it would help on the phone where the transient line is easy to miss.

**SUG-02 — Shuffle sound when hovering your own cards** *(your item 3)*. The
hover cue is bound to `button` elements only (`app.js:164`); the hole cards are
`div.card` inside `#holeCards`, so they never fire it. Note this is
mouse-only by nature — pair it with BUG-07 so it doesn't misfire on touch.
Effort **S**.

**SUG-03 — Remove "NO-LIMIT HOLD'EM"** *(your item 5)*. `index.html:7`, the third
span in `.session-info`. Removing it also shortens a line that QOL-01 says is
too small to read anyway. Effort **S**.

**SUG-04 — Settings menu** *(your item 6)*. What I can point at concretely: the
Display tab is inert outside the packaged build (`display.js:6` disables every
control and shows "Window controls are available in the standalone game"), so on
the web it is a tab of dead selects — the phone layout already hides it. Volume
is three sliders with no separate effects channel; effects ride on master only
(`audio.js:540-554`). Save/Load sit in the same row as Resume and Quit despite
BUG-03. Tell me what you dislike about it and I will scope properly rather than
guess. Effort **M**.

**SUG-05 — Isolated quit** *(your item 7)*. See BUG-04. Suggest "Quit without
saving" as a distinct, confirmed action beside "Save & quit", and make both do
something visible in the browser build.

**SUG-06 — The recap modal opens itself after every hand** (`app.js:111`). Twelve
forced modals per evening. Consider opening it only on request — the "Review
hand" button already exists — or only on showdowns you were involved in.

**SUG-07 — No effects volume slider.** Master, music and ambience have channels;
effects are master-only. A fourth slider is a small change to an already-clean
audio graph.

**SUG-08 — Input.** No controller support, no rebinding, and the H/C/F shortcuts
are undiscoverable outside the rules modal — the phone layout hides the `<kbd>`
hints entirely. Fine for a cosy mouse game; worth knowing you have decided it.

---

## 4. Open questions

**OQ-1 — Is the Jack-Two tribute meant to be able to bust someone?**
`poker.js:470-474` takes `min(bigBlind, stack)` from every dealt-in player with
chips. A player left with 3 chips pays all 3 and hits zero, then gets
auto-rebought next hand. Deliberate folklore, or should it skip players it would
bust?

**OQ-2 — What should Save/Load be?** (BUG-03.) Real named slots, or delete both
buttons and tell the player plainly that the hand saves itself? I lean towards
deleting them — the autosave already works and slots are a feature nobody asked
for.

**OQ-3 — Does the in-game frame-rate setting actually apply?**
`Config/DefaultEngine.ini:23-25` pins `t.MaxFPS=60` and `r.VSync=1` in
`[SystemSettings]`, while the Display tab offers 30/60/120/Unlimited via
`native.setfps()`. I could not verify which wins without running the packaged
build. If the ini wins, the setting is a lie.

**OQ-4 — Do you want the v1.2.0 tag and its zip reconciled?** Noted from the last
session, not from this audit: the release asset now contains two commits that the
tag does not point at.

---

## 5. Deferred — what I did not do, and why

- **Did not run the UE5 package or capture C++ compiler warnings.** Needs the
  installed engine and tens of minutes. The brief asks for every build warning
  and I do not have them. If you want that baseline, say so and I will run it.
- **Did not profile frame time, memory, or GC.** rAF is throttled in the tool's
  browser pane when hidden. Every performance claim above is labelled *measured*
  or *static analysis only*; PERF-02 and BUG-05 are the two that most need a real
  device.
- **Did not test on a physical phone.** The portrait layout was verified in an
  emulated 375×812 viewport with touch emulation, not on hardware. Touch
  latency, audio unlock on iOS Safari, and battery are unverified.
- **Did not read `audio.js` line by line.** I mapped the graph
  (fx/music/ambient → mix → highpass → compressor → master → limiter) and read
  the channel and mute paths, which covers the brief's audio questions: clipping
  is guarded by a compressor and limiter, ambience loops are owned and stopped,
  and master gates mute and tab-hidden. I did not audit the 14 synthesis routines.
- **Did not audit the archived code.** `disabled-lore-feature-archive/` (40 KB)
  is not loaded by `index.html`. It should probably be deleted rather than
  audited.
- **Changed nothing.** No fixes applied, per the brief. `git status` is clean
  apart from this file.
