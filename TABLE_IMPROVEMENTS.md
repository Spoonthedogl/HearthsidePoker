# Settings and table improvements

- The persistent cog icon opens Settings. Escape opens it from the table, or closes the current panel first. Resume, How to play, and Save & quit share this menu.
- Windowed, borderless window, and desktop fullscreen are separate modes. Borderless windows support native edge resizing plus Move, Resize, minimize, and close controls. Arrow keys or the pointer adjust a move/resize operation; Enter accepts and Escape cancels.
- Window size and render quality are labelled separately. Actual window and backing-image dimensions are displayed. Windowed and borderless layouts are saved independently; fullscreen shortcuts return to the previous window mode. Positions are kept within the current monitor's work area when restoring.
- Relaxed, Normal, and Brisk multiply presentation waits by 1.45, 1, and 0.6. The player has no timer. Poker rules, decision policy, music tempo, and sound timbres are unchanged.
- Brief labels beside opponent cards show calls, checks, folds, raises, all-ins, and blinds. Chip movement reinforces chip contributions. These labels pause with the table.
- A showdown recap shows the winning five cards with gold outlines and explains the deciding category, rank, or kicker. Ties and side pots are explicit, including odd-chip allocation. Fold wins keep unshown cards hidden. Review hand reopens the recap.
- Automatic saves include the full game state: deck order, cards, contributions, legal-action/reopening state, pending turn, result, and presentation cursor. Actions and individual revealed board cards save atomically. On return, remaining reveals continue without duplicating cards or paying a pot twice. A brief animation may restart; the hand is not redealt. Previous chip-count saves remain supported.

## Verification

81 automated checks pass, including ten new checks for saved-hand roundtrips on every street, pending card reveals, corrupted saves, chip conservation, short-all-in reopening, deciding kickers, hidden fold cards, tied-pot odd chips, and pace factors.

Browser interaction checks cover the cog and Escape menu, pace selection, quitting guidance for browser previews, reopening the same unfinished hand, playing that hand through the river, and inspecting its winning flush recap. Native tests cover real client/backing dimensions, fullscreen roundtrips, native Move and Resize commands, separate layout persistence, and Save & quit followed by a separate process restoring the exact saved table.

The standalone game and Unreal source project use the same updated runtime files. No paid assets or services were used.

## Display and table polish

Borderless windows now offer desktop-sized resolutions, including 1920 × 1080 on a 1080p display. Normal framed windows still fit the usable desktop area. Settings → Display includes saved 30 / 60 / 120 / Unlimited frame caps. VSync no longer overrides the selected cap. The embedded 2D renderer requests up to 120 FPS; actual presentation depends on the renderer and hardware, and Unlimited refers to the Unreal frame cap.

Moss now mirrors Juniper's distance from Luma. Removed the bottom-left status prose, bottom divider, and decorative table phrases. Community cards, result announcements, and player cards occupy separate vertical lanes. The bankroll and hand details flank the player's cards. Game text cannot be selected; editable controls retain text selection.

Validation: 68 game tests passed; Unreal Editor and standalone builds completed. Native checks verify 1920 × 1080 borderless output, all four frame-cap values, and the announcement/card gap.

## Shared-card clarity and scoring audit

Screenshot 51 correctly forms One Pair from the two shared fives. The winning five available to the player are 5 spades, 5 clubs, ace clubs, jack spades, and 6 diamonds. The hand display now explicitly says when a pair is on the board and shared by everyone. No scoring-rule change was needed.

20,000 seeded seven-card evaluations match an independent exhaustive best-of-21 evaluator. Added regressions for the screenshot, its six-card pre-river state, and incomplete straight/flush draws. The full current suite plus audio preparation checks passes 77 tests. The updated loose runtime is included in both the Unreal source project and standalone package.

## Blind markers and table record

D, SB and BB markers identify the actual dealer and posted blinds, including dealer/small blind together in heads-up play. Blind posting now pauses for 550 ms at Normal pace (scaled by Relaxed/Brisk), with chip motion and a marker entrance. Blind amounts and rules are unchanged.

The chip area shows wins, losses and net chips for this table. A win/loss is a positive/negative chip change over a completed hand; break-even hands count as neither. The record saves atomically with the hand, avoids duplicate counting after resuming, and resets with Fresh table. Existing saves begin tracking from this update.

The tea sip is shorter and more audible, with a soft cup contact at the end. It still alternates randomly with stirring and respects volume/mute settings.
