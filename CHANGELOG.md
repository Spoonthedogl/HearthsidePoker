# Changelog

## Unreleased

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
