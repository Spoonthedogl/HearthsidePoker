# Hearthside: opening chapter

The first connected chapter is now playable. It introduces the Reedbank mystery through seven object/memory observations, six optional contextual questions and seven guest-dependent conversations. It does not reveal the full underlying backstories or resolve the missing engineer.

## Discovering the story

- Between hands, click a guest's sprite or nameplate to spend a moment with them. Keyboard users can focus a guest and press Enter or Space.
- Hover over the spare cup at the lower-left side table, or the drawer at the right cabinet when Moss is present. Their labels appear only on hover/focus.
- Inspect possessions to unlock specific questions. Guests answer one contextual question per completed-hand interval; repeated clicking does not force new answers.
- After the hand review, Deal next hand may offer a short eligible exchange. Next advances each line at your pace. Later lets play continue and preserves that scene for another evening. Escape closes without marking the scene as read.
- One later exchange offers Stay a moment before the next hand, with unrelated guests visually receding.
- Open Notebook from the footer or Settings. Discovered observations include small line sketches; completed conversations preserve their exact lines and unanswered questions. There are no completion percentages or automatic solutions.
- Settings → Sound & motion → Story scenes selects Normal, Occasional or Off. Existing notebook entries remain readable with scenes off.

## Progress and safety

Progress is saved separately under `hearthside-lore`. Fresh table resets poker chips, not the notebook. Completed-hand tokens prevent reloading a result from advancing the story twice. Neither winning nor losing affects eligibility.

Normal mode spaces scenes at least two completed hands apart; Occasional uses four. Required guests, observations and earlier exchanges must be present. Eligible unread scenes are selected deterministically, preventing unlucky random rolls from indefinitely hiding a scene. Declining a scene applies spacing without marking it completed.

The story engine receives only guest names and completed-hand identifiers. It receives no cards, deck, bets or AI inputs. Story dialogs use the same gameplay pause and focus handling as other dialogs; no story changes poker decisions or outcomes. Gentle motion suppresses the added gestures. Existing room ambience continues without horror stingers or required audio-only clues.

## Validation

109 automated checks passed, including story prerequisites, skipped scenes, duplicate-hand protection, persistence, settings and full chapter reachability. Native Unreal checks covered guest inspection, evidence appearing in the notebook, a paused conversation, continuing into the next hand, persisted discovery and the Off setting. A keyboard-focus defect discovered during the native check was corrected and rechecked without logged script errors.

Content lives in `game/lore.js`; presentation is in `game/lore-ui.js` and `game/lore.css`. The source project and packaged Windows game both include the chapter.
