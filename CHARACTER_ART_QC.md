# Character art quality review

Luna and Clipper were revised using the built-in image-generation tool. Juniper, Moss, Mur and Baron were reviewed together and retained; their softer storybook rendering and warm wooden chairs fit the established cast.

- Luna: two uncrossed legs with readable knees, shins and feet in all three frames; thinking, all-in and reading gestures retained.
- Clipper: approved navy double-breasted outfit, ivory shirt, copper cravat and low snout pince-nez retained. Simpler scales, softer shading and expressive eyes bring the rendering closer to the cast.
- Revised chairs: straight rectangular armrests, square supports and straight legs in every frame; no semicircular-to-straight armrest change.
- Both production PNGs have genuine RGBA transparency and three square frames. The opaque checkerboard drafts were rejected.

Current assets:

- `game/assets/luma-seated-v4.png`
- `game/assets/clipper-seated-v4.png`

Older v3 files remain as source history. Runtime selection loads v4 only for these two characters. Hover behaviour, game rules, seating positions and sounds remain unchanged.

## Final generation prompts

### luma

Create a production game sprite sheet on a genuinely TRANSPARENT alpha background, RGBA PNG (no painted checkerboard, no ground or scene). Wide 3:1 canvas, exactly THREE equal SQUARE cells in one horizontal row. Each cell shows the SAME full-body seated character on the SAME dark walnut wooden armchair, fully visible and uncropped with generous padding. Chair must be an identical rigid object in all three cells: straight rectangular armrests, square vertical support posts, flat square seat, four straight square wooden legs, simple back slats. NO semicircular arms, NO changing chair geometry, no turned legs. Identical camera three-quarter facing slightly toward viewer's right, size and chair position across all frames. Charming refined cozy pixel-art, warm amber lighting, clean defined pixel clusters, simple soft storybook shapes, match a cute fox/frog/axolotl/spaniel woodland poker cast. No text, background, table or cell borders. Character: Luna: a cute fluffy lavender moth with cream chest ruff, large amber eyes, round gold spectacles, two long purple featherlike antennae, lavender wings with gold circles, a navy cape with gold stars/moons and round gold clasp. Exactly TWO arms and TWO legs. Legs sit uncrossed side-by-side, with two knees, two separate shins and exactly two rounded feet, a clear gap between them. No extra appendage between or behind the legs; wings stay clearly behind the torso and end above the chair seat. Three frames: left thoughtfully touching cheek with one hand, other on armrest; middle one hand raised delightedly with wings slightly open; right reading a small navy book. All three share the same two-leg seated pose. Anatomy and chair continuity are critical. Full feet and chair legs visible. Real transparent background.

### clipper

Create a production game sprite sheet on a genuinely TRANSPARENT alpha background, RGBA PNG (no painted checkerboard, no ground or scene). Wide 3:1 canvas, exactly THREE equal SQUARE cells in one horizontal row. Each cell shows the SAME full-body seated character on the SAME dark walnut wooden armchair, fully visible and uncropped with generous padding. Chair must be an identical rigid object in all three cells: straight rectangular armrests, square vertical support posts, flat square seat, four straight square wooden legs, simple back slats. NO semicircular arms, NO changing chair geometry, no turned legs. Identical camera three-quarter facing slightly toward viewer's right, size and chair position across all frames. Charming refined cozy pixel-art, warm amber lighting, clean defined pixel clusters, simple soft storybook shapes, match a cute fox/frog/axolotl/spaniel woodland poker cast. No text, background, table or cell borders. Character: Clipper: a friendly olive-green crocodile with cream lower jaw, long rounded snout, expressive warm amber eyes, small gold round pince-nez resting low on the SNOUT BELOW the eyes, without arms over the ears. Navy double-breasted jacket with brass buttons, ivory shirt, copper cravat, charcoal trousers and brown shoes; curved tail behind chair. Preserve this smart navy outfit. Cute warm storybook character with soft simplified scale clusters and cloth shading, NO realistic reptile skin or photographic details. Three frames: left relaxed crossed legs, one hand on knee and other on chair arm; middle sitting forward uncrossed with one open palm extended; right reclining crossed legs and crossed arms. Exactly two arms and two legs in every frame. Anatomy and chair continuity are critical. Full feet and chair legs visible. Real transparent background.



Verification: reviewed all six revised pose drawings, checked 2172 x 724 RGBA files with transparent corners, and verified both atlases load and select all three frames in the packaged Unreal runtime without image masks. The other four character sheets are byte-for-byte unchanged. Source and packaged runtime hashes match.

