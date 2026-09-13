# Seated cast and flexible tables

Open **Table setup** from the footer or Settings. Choose **2–7 total players**, then choose any matching number of guests. A new table resets that table's chips and record; cancelling keeps the current hand.

The oval now has physical seats around its perimeter, in the same order used by dealing and blinds. The human stays at the near edge. Opponent bodies and chairs face inward on the right, while near-side guests appear in front of the rail. Cards, chip stacks and nameplates use separate positions so they remain readable at every supported capacity. Gold turn indicators, dealer/blind markers, saved hands and the visible-card journal remain in place.

All six characters have new full seated artwork with playing, all-in and folded states:

| Guest | Seated character design |
|---|---|
| Clipper | Navy double-breasted jacket, ivory shirt and copper cravat; patient relaxed posture; pince-nez low on the snout. |
| Juniper | Sideways lounge, elbow over the chair and a chip in one paw; an enthusiastic raised-paw all-in. |
| Luna | Thoughtful hand at her cheek, expressive wings; a book when folded. |
| Moss | Leans back with tea in one hand; a sleepy, relaxed folded pose. |
| Mur | Perches on the chair with dangling feet and an inquisitive chip gesture; energetic all-in and curled-up folded pose. |
| Baron | A gentle listening head tilt; an extended-paw all-in and drooping folded expression. |

Each retains its distinct hover movement and quiet original sound. Sound panning now follows the physical side of the table. Hover reactions respect the existing cooldowns, pause, mute and Gentle motion settings.

Clipper uses a clean RGBA sprite sheet directly. The old colour-image/alpha-mask workaround is no longer loaded. Full prompts and asset paths are recorded in **SEATED_ART_PROMPTS.md**; all six sheets were generated using the built-in image tool, with no purchased assets or paid external API.

Validation: 98 automated game/audio-preparation tests passed, including 360 additional varied hands across all six capacities, in-progress saves, unequal-stack seven-player side pots, heads-up blind rotation, and card/nameplate spacing. The packaged native game created and saved every size from 2–7, triggered all six hover animations and sound cues via pointer interaction, and completed a seven-player hand with all 3,500 chips conserved. Original AI personalities and early-betting limits are retained.

The Unreal project and the packaged Windows runtime contain the same updated game files. This update changes the 2D presentation/runtime and assets; no new native executable build is needed.

Final native visual checks covered heads-up, four-player and seven-player tables. A saved seven-player showdown resumed with 3,500 total chips. Move announcements now sit above the community cards; duplicate floating bet labels are suppressed. Preview files: seated-table-preview.png and heads-up-preview.png.

