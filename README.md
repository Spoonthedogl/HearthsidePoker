# Hearthside · Woodland Poker Club

A playable, single-player, cosy pixel-art Texas Hold’em game. It ships as a Windows app (an Unreal Engine 5.8 project), and the very same game plays in any browser and installs on a phone — a sideloadable Android app, or "Add to Home Screen" on an iPhone or iPad. Choose any one to six opponents from Juniper the fox, Luna the moth, Moss the frog, Clipper the crocodile, Mur the axolotl and Baron the dog. All chips are make-believe.

## Play

Open **HearthsidePoker.exe** in the sibling `HearthsidePoker-Windows/Windows` folder. Keep that entire Windows folder together: the executable needs its accompanying Engine and HearthsidePoker folders. No browser, web server, internet connection or account is needed.

Click **Take a seat**. This first click also starts the original music and ambience. Resize or maximize the game window; the artwork keeps its aspect ratio. Open the cog button or press **Escape** for Settings. **Display** offers Windowed, Borderless window, and Fullscreen, independent window sizes and positions, and render quality. **Sharpest (100%)** matches the backing image to the window; **85%** and **70%** trade sharpness for lighter rendering. **F11** or **Alt + Enter** toggles fullscreen. Leave with **Save & quit**, or **Quit without saving** if the evening is best forgotten.

You can also use **Launch Game.cmd** in this project folder to play through the installed Unreal Engine, or open **HearthsidePoker.uproject** / **Open Unreal Editor.cmd** and press **Play** to edit and test the project.

## Phones and tablets

The same `game/` folder is a self-contained web build: serve it over any static web server and it plays in a browser, with the club fund saved to that browser's local storage.

On a portrait phone the table re-deals itself down the screen instead of shrinking the desk layout. The stage switches from its 1440 × 900 design space to a portrait 768 × 1408 one, drawn at roughly double size so it lands at readable text and thumb-sized buttons once scaled to the screen: companions ring a taller oval, each one's nameplate and cards stacked against its own body, and the community cards, your hand and the betting buttons run down the middle. Nothing reflows, because the layout is still absolute — it is a second set of coordinates, not a second layout engine.

This turns on below 560px on the short edge, in portrait. Tablets and desktop browsers keep the desk layout untouched. A phone held in landscape is asked to turn upright, and can tap through to the desk layout anyway. Screen mode, window size and frame rate belong to the standalone build, so Settings on a phone is just sound and motion.

## Install it on a phone

There are three ways to play on a phone, all free and needing no account:

- **Just open the link.** The web version plays in any mobile browser. Once opened, it also works offline, and the club fund saves to that browser.
- **iPhone / iPad — Add to Home Screen.** Open the web link in **Safari**, tap the **Share** button, then **Add to Home Screen**. It installs with the fox icon and opens full-screen, like an app, and runs offline. (Apple does not allow a free, shareable `.ipa`; the home-screen install is the free equivalent and needs no Mac, developer account or App Store.)
- **Android — install the app.** Download the latest **Hearthside-Poker APK** from the [Releases page](https://github.com/Spoonthedogl/HearthsidePoker/releases) and open it. Android will ask you to allow installing apps from this source the first time; the app then works entirely offline. It is not on the Play Store, so it installs as a normal sideloaded app.

The web/home-screen versions are published from `game/` to GitHub Pages by `.github/workflows/pages.yml`. The Android app is a thin [Capacitor](https://capacitorjs.com) wrapper around the exact same `game/` files; see **mobile/README.md** to rebuild or update it.

## Play with friends

An optional private table for people on their own devices: one player creates a room and shares a short code (no public matchmaking, no direct IP connection); everyone else joins with it, and the room code has a one-tap copy button in the lobby. Unclaimed seats are still played by the companions, so a two-friend room looks and plays exactly like the single-player table. Online rooms don't use the 12-hand evening or the club fund — instead, they play a fixed-length game (7 hands by default, choose 3–15 when creating a room). Bust out and you sit out the rest of that game only; a standings screen at the end ranks everyone and tracks a running win count for the room, then everyone is refunded straight into a fresh game. A player who disconnects mid-hand shows an "Away" tag at their seat and gets a shorter turn clock, rather than holding everyone up.

This needs a small always-on server, run on [Cloudflare Workers](https://workers.cloudflare.com/)' free tier (no payment method required) — see **worker/README.md** to deploy your own. The referee is the same `game/poker.js` rules engine the single-player game uses, imported directly rather than reimplemented, and every hole card stays server-side until a genuine showdown reveals it.

## Seated cast and table sizes

Table setup supports every size from 2 to 7 total players. Seats follow clockwise order around the oval, with the human at the near edge. All six companions have full seated artwork, visible chairs, and three distinct mood poses. Right-side guests face inward; near-side guests appear in front of the rail. Clipper now wears a navy double-breasted jacket and copper cravat, with low pince-nez on his snout. See **SEATED_TABLE_UPDATE.md** and **SEATED_ART_PROMPTS.md**.

## Visual and character revision

The table now has a smooth continuous rim. Compact nameplates sit above the characters, with larger opponent cards on the felt. The room has more clearance around the rocking chair, matching back-wall lantern heights, and separation between the candle and plant. The two requested idle text lines have been removed.

The new fox-and-poker-chip emblem appears in the header, browser icon and both Windows executables. Each character has three original painted poses—playing, all in and folded—plus a distinctive voice. Quips occur occasionally, one at a time, with cooldowns and no hidden-card knowledge. See **CHARACTER_PERSONALITIES.md**.

## A calmer, livelier table

Companions keep early wagers small and stop early re-raising loops. They do not proactively shove before the turn; calling with a short stack can still use its final chips. Strong later-street bets remain possible. See **AI_BEHAVIOR.md** for the policy and seeded comparisons.

The companion whose turn it is receives a filled gold nameplate, dark lettering and a diamond marker. Physical chip stacks beside each opponent's cards change at 1, 50, 150, 300, 600 and 1,000 chips; the nameplate always gives the exact amount. Empty stacks leave a small vacant spot.

Taking a seat plays a short settling movement before dealing. The title becomes smaller, decorative labels recede and the betting prompts stay concise. The room now has rain moving within its window panes, flickering fire and candle accents, and subtle local light around nine sources.

The ginger cat sleeps on its cushion most of the time. Rarely it stretches, licks its paw or turns to watch the rain, then curls back to sleep. These use eight original transparent sprite frames. Cat and room motion pause with dialogs or hidden windows; Gentle motion keeps the cat asleep and the lights still. No animation reads cards or signals hand strength.

## At the table

- Two through seven seats, 500 chips each, rotating dealer and no-limit betting.
- **Table setup** chooses the companions' skill — **Gentle** (they make more mistakes), **Standard**, or **Sharp** (they read their hands closely) — and the kind of evening: a **Steady table** at 5/10 all night, **Rising blinds** that climb every four hands from 5/10 to 15/30 as the fire burns down, or **High stakes** at 10/20. The session line always shows the current blinds, and a rise is announced at the table.
- Fold, check, call, raise, and all in. The raise control is the **total wager for the current betting round**.
- Standard best-five-of-seven evaluation, ties, side pots, uncalled returns, and correct short-all-in reopening rules.
- Opponents make decisions from their own cards, the public board and betting state. They do not inspect your cards or the deck order.
- The game waits for you; there is no turn timer. Opponents also pause while a journal or settings dialog is open.
- Run out of chips and you can simply buy back in; the evening carries on. Companions who bust buy back in by themselves, so the table never empties.
- Win a showdown holding a Jack and a Two and the rest of the table chips in a small bonus. No chips are created: it only ever moves between stacks.
- Unfinished hands save automatically, including cards, deck order, bets and whose turn it is. **Return to the table** continues the same hand and pending reveals. There is no Save or Load button: the hand saves itself after every action, and Settings offers **Save & quit** or **Quit without saving**.
- Choose **Relaxed**, **Normal**, or **Brisk** pacing. Brief opponent action labels and moving chips make bets easier to follow.
- **Review hand** opens the showdown recap, listing every hand that reached showdown, strongest first, so you can see what everyone held. It waits to be asked rather than interrupting each hand.

## Evenings and the club fund

An evening at Hearthside is twelve hands. When the last one is played the fire has burned low, and the table settles up.

Whatever you finish above the stack you sat down with is yours, less a part-cost for each time you bought back in, and everyone drops something in the kitty besides. It all goes into the **club fund** — and the fund goes back into the room: bank the hearth, trim the mantel candles, refill the lanterns, set a candle by your elbow, add a reading lamp, buy the cat a better cushion. The room gets warmer and brighter the longer the club runs.

Nothing is ever locked behind the fund. No companion, table size or feature is gated; it is all just atmosphere. A bad evening earns less, never less than nothing, and the room never goes backwards. Open **The club fund** in the footer at any time; its ledger shows how many evenings you have played, your best night, and how much of the room you have built. The evening close-out marks your first evening and any night that beats your best.

Swingier evenings bank more: a rising or high-stakes table, or gentler companions, tends to put more into the fund than a steady night, because a night can only ever bank upward.

## Your hand journal

Click **Hand journal**, the current-hand panel, or press **H**. Close with its ×, **H**, **Escape**, or the darkened backdrop. Three tabs: **Your possibilities**, **This hand**, and **Hand rankings**.

**This hand** writes the hand down as it happens — who dealt, the blinds, every check, call, raise and fold, each street with its cards, and the result. It only ever shows what has already been dealt at the table, never what is coming.

The journal uses **only your two cards and the community cards already shown**. Gold outlines identify the best currently visible cards. Each category shows its probability of being your strongest final hand by the river. These are hand-making probabilities, not your chance of winning against opponents.

- **Preflop:** a clearly labelled estimate from 12,000 hypothetical boards. Rare outcomes may not appear in that sample; they are not marked impossible just because they were not sampled.
- **Flop:** all 1,081 possible remaining two-card boards from the 47 unseen cards are counted.
- **Turn:** all 46 unseen final cards are counted.
- **River:** the actual completed hand is shown.

Select a category to see an illustrative five-card outcome made using your own visible cards and possible future cards. Cards are labelled **YOURS**, **TABLE**, or **POSSIBLE**; hypothetical cards have dotted borders. No prediction of the shuffled deck is made. Specific next cards that immediately improve your hand category are shown after the flop; these are not guaranteed winning outs. The ranking reference includes all ten named ranks, with Royal Flush explained as the highest Straight Flush. Probability categories group them together to avoid double-counting.

## Sound, display and comfort

The cog button or Escape opens Settings. **Display** appears only in the standalone game, where its window controls do something; in a browser Settings is just **Sound & motion**. Leaving the table is kept apart from the rest: **Save & quit**, or **Quit without saving**, which asks once before it throws the evening away. There is no Save or Load button — the hand saves itself after every action. Sound controls include separate master, **cards & chips**, music, and ambience levels, mute, a chip-sound preview, and reduced motion. Display preferences save locally; changing only render quality keeps a maximized window maximized. Fullscreen fills the current monitor without changing the desktop resolution. Every sound is original and synthesized locally: felt swishes, ceramic chip clicks, wooden taps, soft card flips, a cascading win chord, quiet 76 BPM keys, rain, and hearth crackle. Preferences save locally. Sound quiets automatically when the app loses document visibility. On a phone, any touch unlocks sound, it returns by itself after a call or a switch to another app, and recent iPhones play it even with the silent switch on. **Four-colour deck** gives diamonds and clubs their own colours, and **Larger text** enlarges the table's small print and the contents of every panel.

Keyboard: **H** journal · **C** check/call · **F** fold · **Escape** open Settings / close current panel · **F11** / **Alt + Enter** fullscreen. Controls also support keyboard focus and tab navigation.

## Edit the game

The project uses a native C++ Unreal GameMode with Unreal’s bundled Slate/Chromium Web Browser widget. The 2D presentation, poker logic and Web Audio instruments are local HTML/JavaScript/CSS files inside `game/`. This is the deliberate architecture of this prototype; the gameplay is not authored as Blueprint graphs or Unreal 3D meshes. Blender is not required for these 2D assets.

- `game/app.js` — interaction, pacing, animations, journal, local saves.
- `game/session.js` — validated unfinished-hand saves, pace factors and showdown explanations.
- `game/style.css` and `game/refinements.css` — layout, cards, room composition and sprite states.
- `game/companions.js` — character personalities and occasional public-action-based quips.
- `game/poker.js` — independently testable rules, AI and visible-card analysis.
- `game/audio.js` — original procedural audio engine.
- `game/display.js` and `game/display.css` — native display controls with a browser preview fallback.
- `game/computation.js` and `game/poker-worker.js` — responsive visible-card calculations, with scheduled batches when local-file workers are restricted.
- `game/presentation.js` and `game/table-life.css` — turn indicators, bankroll stacks and sitting animation.
- `game/cat.js` and `game/ambience.js` — rare cat sequences and local room motion.
- `game/assets/` — generated room, characters, cat frames and application icon.
- `Source/` and `Config/` — native Unreal host and packaging settings.

Edits to the game files take effect on the next game launch; C++ host edits need a rebuild. Run **Build Project.ps1** to rebuild the editor module and **Package Game.ps1** to build/cook/stage a standalone Windows package. See **BUILD-NOTES.md** for installed dependencies and exact engine version. The packaged game includes loose copies of `game/`, so copy any final presentation edits there or repackage.

## Verification

137 automated game tests pass, covering the rules and hand guide, companion dialogue, AI behavior, cat animation, asynchronous computation, session saves and recap, seating across every table size on both the desk and portrait phone layouts, and the club fund. They include comparison against an independent exhaustive evaluator, wheel straights, ties, side pots, and legal betting. An additional 20,000 simulated hands completed while conserving all chips. Browser interaction tests cover joining, journal opening/closing, actual-card examples, rankings, raise/call/fold, complete hands, new hands, pausing, sound settings and rules. The native Unreal runtime and packaged executable both loaded successfully with no JavaScript errors. All 14 sound cues were rendered through a real audio engine and checked for output, headroom and finished-tail cleanup.

A further 34 automated tests in `worker/tests/` cover the online-room referee against no browser or network at all: seat/token binding and reconnect, rejection of illegal or out-of-turn actions, turn-clock and between-hands timing, fixed-length games and standings, and a redaction fuzz test confirming no player is ever sent another seat's hole cards. Online play itself — joining, disconnect/reconnect, presence, a full game to standings — is verified live with two real browser sessions against the deployed Worker, not just this automated suite.

To run the rules tests with Node.js: `node --test game/tests/*.test.cjs`. To also run the online-room tests: `node --test game/tests/*.test.cjs worker/tests/*.test.cjs`.

This is a complete playable prototype: seat counts from two to seven, six selectable companions, local single-player sessions, and optional online rooms for playing with friends. It does not include controller navigation, localization or a broader campaign.

Display validation also covers actual native render textures at 100%, 85% and 70%, maximize, fullscreen shortcuts, trusted pointer clicks after scaling, and saved settings across a relaunch. Ambient-rendering and audio-preparation checks pass alongside the game suite. Audio prepares silently during loading so opening the device does not interrupt the first click; sound still begins only after interaction. See **PERFORMANCE.md** for measurements and their limits, and **TABLE_IMPROVEMENTS.md** for the settings, pacing, recap and session-save revision. Native Save & quit was verified across separate processes with the complete saved table matching after relaunch.

## Art, audio and cost

No assets or subscriptions were purchased, and no paid API calls were made. The original and revised art assets were created using the built-in OpenAI image-generation tool, authorized in the brief. All sounds are original procedural synthesis. No Balatro audio, music, art or code is included. System fonts are referenced from the player’s computer and are not bundled. See **ASSETS.md** for provenance and generation prompts, and **SOUND_DESIGN.md** for the audio implementation.

Rules were checked against the [Poker TDA rules](https://www.pokertda.com/view-poker-tda-rules/) and [Texas Hold’em rules](https://www.pokerstars.com/poker/games/texas-holdem/). Audio gesture behavior follows the [Web Audio AudioContext API](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext).

See **WOODLAND_EXPANSION.md** for table setup, the expanded roster, hover reactions and rare cat animation.

The opening Reedbank story/notebook chapter has been pulled from the live game while it's reworked; its code and docs are kept in `disabled-lore-feature-archive/` for now, not shipped in `game/`.

