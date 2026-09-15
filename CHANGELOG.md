# Changelog

## v1.6.11 — 2026-09-15

Fixes the hand-strength panel only being clickable in a thin sliver
of its actual area.

**Save compatibility:** unaffected.

### Fixed

- **"See your chances" now responds across its whole panel, not just
  a thin strip at the top.** The row of turn info and action buttons
  sitting just below it was invisibly overlapping almost the entire
  panel and quietly swallowing clicks meant for it - fixed so the
  panel's real interactive area now matches what it looks like.

## v1.6.10 — 2026-09-15

Small clarity touches to the hand review screen and the hand-strength
panel.

**Save compatibility:** unaffected.

### Added

- **Hand review now shows a small portrait next to each name**, in
  both the showdown list and the pot-winner list, with a little more
  breathing room between rows.

### Changed

- **"See your chances" now highlights across its whole panel on
  hover**, not just the small pill - the hand name and subtitle above
  it have always been part of the same clickable button, and now look
  it too.

## v1.6.9 — 2026-09-15

A visual fix for the phone/mobile web layout.

**Save compatibility:** unaffected.

### Fixed

- **Companions no longer clip on top of the table on mobile web.** A
  side seat's chair or legs could visibly overlap the felt instead of
  sitting naturally beside it. Seats that genuinely sit close to the
  table's edge still lean in front of the rail so a tighter table
  never swallows them - only the seats that don't need it were
  affected.

## v1.6.8 — 2026-09-15

Fixes a ~20-second dead stall once every real player busts in the
same hand, and gives a game something to show for it besides who won
the last one.

**Save compatibility:** unaffected.

### Fixed

- **The table no longer stalls for a full 20 seconds once every real
  player has busted in the same hand.** A busted seat has nothing to
  click, so if that happened to everyone at once (an AI winning a
  multi-way all-in over both real players, say), the room used to
  wait out the same grace period meant for a slow human before
  dealing the next hand - a long silent pause with nothing visibly
  happening. It now deals immediately in that case; a player who's
  merely disconnected (but still has chips) still gets their normal
  chance to reconnect first.

### Added

- **A running net-chips total for the whole session**, shown next to
  the win count on the standings screen after every game - e.g.
  "Alice — 2 wins · +350 chips." Every game still starts everyone at
  a fresh 500, so no lead ever carries into the next table; this
  just keeps track of who's actually come out ahead across an
  evening of games.

## v1.6.7 — 2026-09-15

Fixes a busted player getting permanently stuck once their game ended
and reset.

**Save compatibility:** unaffected.

### Fixed

- **A player who busted out of a game no longer freezes for good once
  that game ends.** Everyone else kept playing normally, but the
  busted seat's screen stayed stuck with no cards and no way to act,
  even once a fresh game refunded them and it became their turn
  again. The table itself was never the problem - reconnecting to a
  frozen seat now just isn't necessary, since it never gets stuck in
  the first place.

## v1.6.6 — 2026-09-15

Small online-play polish: sharing a room code and noticing a dropped
opponent are both easier now.

**Save compatibility:** unaffected.

### Added

- **A "Copy" button next to the room code** in the online lobby, so sharing
  it doesn't mean reading it aloud or typing it out by hand.
- **A live "Away" tag** appears on a seat the instant that player
  disconnects mid-game, instead of only catching up once the next hand
  happens to deal.

## v1.6.5 — 2026-09-15

Online play now runs in fixed-length games, so a bust never means sitting
around with nothing to do for the rest of the night.

**Save compatibility:** unaffected.

### Added

- **Online rooms now play a fixed-length game** (7 hands by default,
  choose 3–15 when creating a room) instead of one endless table. Bust
  out and you sit out the rest of that game only — everyone is refunded
  and dealt straight into a fresh game the moment it ends.
- **A game also ends early** the instant only one player still has
  chips, rather than playing out empty hands.
- **A standings screen** appears at the end of every game, ranking
  everyone by final chips (or how long they lasted, if they busted),
  alongside a running win count for the room's players this session.

## v1.6.4 — 2026-09-15

Fixes a table that could stall forever once too many players busted.

**Save compatibility:** unaffected.

### Fixed

- **A hand that leaves fewer than two players with any chips no longer
  stalls the table.** Everyone clicking "Ready for the next hand" used
  to look like it worked but never actually dealt again. The table now
  correctly closes with a clear message and a way to leave.

## v1.6.3 — 2026-09-15

Online play survives a reload now.

**Save compatibility:** unaffected.

### Added

- **A dropped or reloaded browser tab can rejoin an online room.** If a
  phone backgrounds the game long enough to discard the tab (or you
  just refresh by accident), "Rejoin room CODE" appears on the main
  screen and puts you straight back in your seat, mid-hand.
- Coming back to the tab now double-checks the connection right away
  and quietly reconnects if it had gone stale in the background,
  instead of waiting for your next click to notice.

## v1.6.2 — 2026-09-14

The real fix for hand 2 freezing online.

**Save compatibility:** unaffected.

### Fixed

- **The table no longer freezes after the first online hand.** v1.6.1's
  reconnect fix addressed a real gap, but a separate, more fundamental
  bug survived it: the board, cards and message could stay stuck on
  hand 1 forever while the hand counter kept climbing underneath. Also
  closes a related crash a player busting via all-in could trigger.
- A player sitting out a hand after busting now shows "Sitting out"
  instead of a stray "undefined high".

## v1.6.1 — 2026-09-14

Online play fixes, from the first real sessions with friends.

**Save compatibility:** unaffected.

### Fixed

- **A dropped connection or a rejected action no longer strands you.**
  Online play now quietly reconnects to your same seat after a phone
  locking or a brief network blip, and a rejected action (a stale click,
  a timing race) unsticks the table instead of leaving it waiting
  forever.
- **Other players' names now show correctly above their character**,
  instead of showing the name of whichever companion's sprite they
  happened to borrow.
- **Confirming a raise on a phone no longer flashes "Turn your phone
  upright."** The on-screen keyboard was being mistaken for a rotation.

### Added

- **Choose which companion's look represents you** when creating or
  joining an online room. Names are capped at 12 characters.

## v1.6.0 — 2026-09-14

Play with friends: a private table, joined by a short code.

**Save compatibility:** unaffected. Nothing about single-player changes —
this is a new, optional mode alongside it.

### Added

- **Play with friends**, from the same screen as "Take a seat". Create a
  room and share the code it gives you, or join one a friend created.
  Unclaimed seats are still played by the usual companions, so a two-friend
  room looks and plays exactly like the table you already know.
- A small always-on server (an optional self-hosted [Cloudflare
  Worker](https://workers.cloudflare.com/), free tier, no payment method
  required — see **worker/README.md**) referees online rooms using the exact
  same rules engine the single-player game already uses. It is the only
  place any hand or card is decided; no hole card is ever sent to a device
  before it is genuinely revealed.
- A dropped connection gets a short grace period to return before its seat
  automatically checks or folds, so an evening never gets stuck waiting on
  someone's connection.

### Not yet included

Free-text or voice chat, a spectator mode, joining a room already under way,
and a visible turn-clock countdown. Online rooms also don't use the 12-hand
"evening" or the club fund — they simply keep dealing hands.

---

## v1.5.4 — 2026-09-14

**Save compatibility:** unaffected.

### Fixed

- **Card suits render as crisp text on every phone.** On some devices (Samsung
  among them) a card's ♣ was drawn from the colour-emoji font — pinched, and
  ignoring the card's own colour. Every suit now uses the plain text glyph, so
  clubs look right, and hearts and diamonds take the deck's muted red (and the
  four-colour deck's blue/green) instead of a bright emoji red.

---

## v1.5.3 — 2026-09-14

**Save compatibility:** unaffected.

### Fixed

- **The windowsill cat sleeps on top of the blanket.** v1.5.2 sat it a little too
  low, on the blanket's front overhang; it now rests on the flat top of the
  cushion, where a cat would actually curl up.

---

## v1.5.2 — 2026-09-14

Small follow-ups to v1.5.1: the cat actually sits down, and web updates reach
you without a hard refresh.

**Save compatibility:** unaffected.

### Fixed

- **The windowsill cat rests on its cushion.** v1.5.1 moved it onto the window
  but left it hovering above the sill; it now sits properly on the cushion,
  matching the desktop layout.

### Under the bonnet

- **Web and home-screen updates now reach returning players.** Each release's
  stylesheets and scripts carry a version tag, so a fix is never masked by a
  copy the browser or home-screen app cached from a previous visit — which is
  why the v1.5.1 cat fix first appeared to do nothing on a phone that had the
  old stylesheet cached.

---

## v1.5.1 — 2026-09-14

A pass over the phone layout and the parts of the game that were hard for a
newcomer to read.

**Save compatibility:** unaffected. Rules, saves and the club fund are unchanged
— this release only fixes how things are drawn and explained.

### Fixed

- **The cat is back on the windowsill on phones.** In portrait the room art is
  fitted to the width and drawn at about half size, but the sleeping cat was
  still placed and sized for the desktop layout, so it drifted off its cushion
  and out of sight. It now sits on the sill again, with all of its poses.
- **Playing cards read cleanly on phones.** The rotated index in the
  bottom-right corner of every card was being stretched across the whole face,
  smearing the rank and suit over the middle. Your cards, the community cards
  and the cards in the journal are now crisp.

### Changed

- **The hand guide is easier to find and use.** "Hand details" is now a clearly
  tappable **See your chances** button, and the possibilities screen spells out
  that you can tap any hand to see an example — and, once the flop is down, the
  exact cards you'd still need to make it.
- **How to play, rewritten for newcomers.** It now assumes no poker knowledge:
  it says what the blinds are, how a hand plays from deal to showdown, and what
  check, call, raise and fold each mean, in plain words.

---

## v1.5.0 — 2026-09-13

Play it on your phone. The same game now installs as an Android app and adds to
an iPhone or iPad home screen, and the browser version plays offline.

**Save compatibility:** unaffected. The game rules, saves and club fund are
exactly as in v1.4.0 — this release only adds new ways to install and run it.

### Added

- **An Android app.** A real, installable app (a signed APK on the releases
  page) that bundles the whole game and runs offline, with no account, store or
  internet connection. You install it by opening the file on the phone; Android
  asks once to allow it. The app is the same game as the browser and Windows
  versions, wrapped for the phone.
- **Add to Home Screen, on iPhone and iPad.** Open the web link in Safari, tap
  Share, then Add to Home Screen: the game installs with the fox icon and opens
  full-screen like an app. (Apple does not allow a free, shareable app file, so
  this is the free way onto an iPhone — no Mac or developer account needed.)
- **Offline play in the browser.** Once the web version has been opened, it
  keeps working with no connection, on a phone or a computer.
- **The web version is published automatically.** A workflow puts the playable
  game online whenever the game changes, so there is always a link to share.

### Fixed

- **The table fits the screen the moment the app opens.** On the very first
  launch of the installed app the table could appear mis-sized or off to one
  side until the phone was rotated, because the app's window finished resizing a
  breath after the game had already measured it. The game now watches its own
  window and fits itself on the first frame.

---

## v1.4.0 — 2026-09-13

Choose how your evening plays, keep a ledger of the club, and two new ways to
make the table easier to read.

**Save compatibility:** unaffected. An evening saved by v1.3.0 carries on at a
steady table with standard companions, exactly as it was being played.

### Added

- **Choose how good your companions are.** Table setup offers Gentle, Standard
  or Sharp companions. Gentle ones misjudge their hands and call too often;
  Sharp ones read the table closely and press when they are ahead. Standard is
  the table you already know, exactly as it was.
- **Choose the kind of evening.** A steady table at 5 / 10, rising blinds that
  climb every four hands to 15 / 30 as the fire burns down, or a high-stakes
  table at 10 / 20. Swingier tables tend to put more into the club fund.
- **A ledger for the club.** The club fund shows how many evenings you have
  played, your best night, and how much of the room you have built, and the
  evening close-out celebrates your first evening and any new best night.
- **Four-colour deck**, in Settings: diamonds turn blue and clubs green.
- **Larger text**, in Settings: the table's small print and every panel's
  contents get bigger without anything running off the screen.

### Fixed

- On a phone, "Hand details" under your current hand was far too small to read.
- On a phone with a full table, a companion's nameplate could cover their own
  cards or a neighbour's, most often while a status like "Big blind 20" wrapped
  onto a second line, and on smaller tables the top nameplate tucked under the
  title. Seats now leave room for both, the table message sits just under the
  board, and the teacup has moved beside your cards.

---

## v1.3.0 — 2026-09-13

The first release to include the portrait phone layout, and a pass over the
things that were quietly not working.

**Save compatibility:** unaffected. Evenings saved by v1.2.0 still load. An
evening that v1.2.0 had already refused to load stays lost — it was lost when
it was written.

### Fixed

- **Sound plays on phones.** On a phone the table could stay silent all
  evening. A companion's bet could ask for sound before you had touched the
  screen, and a phone never grants that; every tap afterwards then waited on
  the refused request instead of asking again. Any touch now wakes the sound,
  it comes back by itself after a phone call or a trip to the home screen, and
  on recent iPhones the silent switch no longer mutes the table.
- **An evening no longer disappears when someone buys back in.** If any player
  ran out of chips and bought back in — which companions do by themselves, most
  nights — the saved hand quietly failed to load next time you opened the game.
  You would find a fresh table instead of your evening, with the hands you had
  played toward the club fund gone. This was the worst thing in the release and
  it is fixed.
- If a hand ever can't be read back, the table now tells you so, instead of
  saying nothing and starting over.
- **On a phone, chips fly to the pot again.** Chips and celebration sparks were
  aiming at where things sit on a desktop screen, so in portrait they flew off
  toward the edge.
- The hand journal no longer gives up on its background worker after one slow
  calculation, which on a slower phone left every later hand doing its sums the
  long way round.

### Added

- **A written record of the hand.** The journal has a new **This hand** tab
  listing everything as it happens: who dealt, the blinds, every check, call,
  raise and fold, each street with its cards, and how it ended. It only shows
  what has already been dealt.
- **Quit without saving**, beside Save & quit, for an evening best forgotten.
  It asks once before throwing anything away, and never touches the club fund.
- **A volume slider for cards and chips**, separate from music and from the
  rain and hearth.
- Your own two cards riffle softly when you run the pointer over them.

### Changed

- **The small print is bigger.** Nameplate captions, the line under Hearthside,
  the chip labels and the footer were 9–10px with wide letter-spacing over
  painted room art. They are now 11–12px with tighter spacing and a soft dark
  edge, so they hold up against lantern light.
- **The hand recap waits to be asked.** It used to open itself after every
  hand — twelve interruptions an evening. **Review hand** is still right there.
- Settings keeps leaving the table apart from changing the volume, and the
  **Display** tab now appears only in the standalone game, where its window
  controls actually do something.
- Tapping a button on a phone no longer plays two sounds at once.

### Removed

- **Save and Load.** "Load" only reloaded the page, and there was never a
  second save slot for "Save" to write to — the hand has always saved itself
  after every action. The buttons promised something that did not exist.
- **"NO-LIMIT HOLD'EM"** from the line under the title.
- 2.4MB of the download that no longer did anything: a character mask that had
  been switched off in the styles for some time, but was still being fetched
  and decoded before the game could draw. The game is now 14MB rather than
  17MB.

### Under the bonnet

- The dust in the firelight stops moving behind menus and in gentle motion,
  rather than repainting the whole room forever.
- Volume sliders write your preference once you let go, not on every pixel of
  the drag.
- The table now owns its own record of a hand, rather than the interface
  reaching in to clear it.
- The Android file-server plugin is switched off. It was enabled, with a
  generated token committed alongside it, on a game that only ships on Windows.
- Tests run automatically on every push. There are 123 of them, and they take
  under two seconds.

---

## v1.2.0

Evenings that end, and a room that grows: the club fund.

## v1.1.0

Rebuys, the Jack-Two tribute, save and load, and the compact showdown recap.

## v1.0.0

First release.
