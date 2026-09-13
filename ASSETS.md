# Original asset provenance

The raster artwork was generated for this project with the built-in OpenAI image-generation tool. No CLI/API fallback, paid API request, purchased asset or third-party art pack was used. The tool did not expose a model-selection parameter or a model identifier; the project does not claim an independently verified image model version. Original generated PNGs were copied into the project, and CSS atlas windows position the characters without rewriting image pixels.

## game/assets/room.png

Generation prompt:

> Use case: stylized-concept. Asset type: production background for a cosy pixel-art poker videogame called Hearthside. Create a beautifully composed wide 16:9 pixel art interior of a tiny woodland card room at rainy blue hour. Authentic meticulously placed chunky pixels, limited palette of warm chestnut wood, candle honey, moss greens, dusky mauve and muted midnight blue, rich subtle dithering, illustrated 32-bit game feel. Camera is centered slightly elevated looking into the room. At the top left a rain streaked window with blue evening forest, on left a small fireplace with orange coals and stacked firewood, at the upper right a bookshelf of books and a leafy plant, hanging warm lanterns, charming tiny teacups, a small framed forest print. The middle 60 percent and bottom middle are clear unobstructed dark warm wooden floor with a large subtle oval rug, empty negative space where we will place an interactive poker table in code. No poker table, no playing cards, no characters, no UI, no labels, no typography or words or logo or watermark. Corners richly decorated but composition is restrained not cluttered. Warm welcoming quiet magical cosy pixel-game art, crisp visible pixels with no smooth rendering. Output landscape 1536x1024 or wider.

## game/assets/companions.png

Generation prompt:

> Use case: stylized-concept. Asset type: transparent-background sprite atlas for a cosy woodland pixel art poker videogame. Create exactly THREE distinct cute large game characters in a single horizontal row, each fully inside its own equal-width third, at matching scale with their heads on the same horizontal level and bottoms on same level, generous gaps, no overlap. Left third: friendly orange fox with cream muzzle and big pointed ears, rust waistcoat and dark green scarf, sly but kind expression, hands together before his tummy. Centre third: fluffy lavender moth astronomer, large feathered purple antennae, tiny round gold spectacles, starry midnight-blue shawl, beautiful rounded lilac wings and thoughtful warm expression. Right third: plump moss-green frog wearing a cosy mustard cardigan and tiny flat cap, cream tummy, rosy cheeks, sweet wide-set eyes, holding a tiny white teacup. All sitting on invisible stools, front facing chest and waist visible, designed to sit behind a poker table that will be rendered separately, feet not necessary. Authentic chunky pixel art with crisp square pixels, sophisticated limited warm muted palette, attractive readable silhouettes and tiny pixel highlights, subtle dithering. No ground shadow or floor, no props outside their silhouette, no playing cards, no text, no logo. Fully transparent empty background. Polished charming 32-bit game sprite style. Landscape output with uniform spacing.

## Room revision and Windows icon

`game/assets/room-v2.png` is a built-in image-generation edit of the original room. The edit moves the lower-left rocking chair farther left and slightly backwards, matches the two back-wall lanterns' heights and body sizes, and separates the right cabinet's candle from the plant. The camera, room architecture, pixel-art palette and unrelated decor are preserved. The original `room.png` remains available.

`game/assets/hearthside-icon.png` is the new generated fox-and-poker-chip application mark. Its Windows-format counterpart, `Build/Windows/Application.ico`, is a deterministic export of the same artwork, with 16, 24, 32, 48, 64, 128 and 256 pixel frames. No new art or paid service is involved in that format conversion. Unreal embeds the ICO into both the native game and its launch executable.

## Other presentation

Table, felt, playing cards, particle effects, UI and animations are original CSS/canvas/JavaScript. Card suits and teacup glyphs use system font characters. Audio is synthesized from oscillators, deterministic noise buffers, envelopes, filters and room reflections; no external recordings or samples are included. Unreal and Chromium runtime components in the Windows package retain their accompanying notices.

## Character state sheets

`juniper-states.png`, `luma-states.png` and `moss-states.png` are original built-in image-generation outputs, each 1881 × 836 RGBA. Each sheet has three 627 × 836 cells, ordered playing / all-in / folded. The final files have true alpha transparency; opaque pixels do not cross cell boundaries. No image pixels were edited in code. CSS selects the frame from the last processed public poker action.

Complete final sprite generation prompts and output references are in **ART_GENERATION_PROMPTS.json**. Earlier outputs with simulated checkerboard backgrounds were rejected and are not used by the game.

## Revised room generation prompt

# Room revision — built-in image generation

Mode: built-in imagegen edit; no paid API or API key.

Edit target: outputs/HearthsidePoker/game/assets/room.png

Generated source: C:\Users\benff\.codex\generated_images\01a0960b-047b-72b3-8556-23358b8fb899\exec-5a47e69b-eb0d-4c07-a423-4ecf7e17b709.png

## Prompt

Use case: precise-object-edit.
Asset type: pixel-art background for an existing cosy woodland poker game.
Input image 1 is the EDIT TARGET. Edit this same room, keeping its 1536x1024 framing, fixed camera, pixel-art rendering, dark warm amber/brown palette, blue rain outside the window, fireplace, shelves, sleepy cat, oval floor rug and all unrelated decor unchanged.

Make only these three localized corrections:
1. The rocking chair in the lower LEFT foreground is too close to where a large poker table will be composited over the central oval rug. Move the entire chair farther toward the far left wall/left edge, reduce its apparent size slightly (about 15%), and place it a little farther back in the room. The chair can be partly cropped by the left image border. Keep its green checked blanket, flower cushion and wooden rocking runners. Leave a clearly wider visible strip of unobstructed wooden floor between the chair's rightmost edge and the oval rug's left edge. Keep the nearby small foreground stool with teacup, candle and snowdrop flowers in their existing position.
2. The TWO hanging wall lanterns directly flanking the framed forest landscape painting on the BACK wall must be a matched pair at EXACTLY THE SAME VERTICAL HEIGHT and same apparent body size. Align their top edges, glowing bodies and bottom edges horizontally. Keep both as matching warm brass lanterns hanging beside the painting; retain the painting, window and wall architecture in their existing positions. This refers ONLY to the back-wall lantern at x~770 and the one at x~1085, not the window-sill lantern.
3. On the small cabinet in the lower RIGHT foreground, move the little candle bowl leftwards across the cabinet top so there is an obvious empty stretch of the green cloth-covered surface separating the flame/candle from the tall vase of flowering greenery on its right. Keep the vase, plant, cabinet and cloth unchanged; the flame must not visually touch or merge into the leaves or flowers.

Preserve the existing art and perspective, sharp small pixel clusters and richness of detail. Do not repaint the room in a new style. No people, no creatures added, no poker table, no cards, no UI, no letters, no watermark. The central floor/rug area remains completely empty for later game compositing.


## Game icon generation prompt

Create an original polished pixel-art game icon for Hearthside, a cosy woodland animal poker game. One compact memorable emblem: a friendly russet fox’s face with cream muzzle, warm sleepy eyes and pointed ears, nestled into a deep moss-green round poker chip. Small honey-gold segmented accents around the chip rim. Two tiny ivory playing cards fan out just behind the fox on the upper right, one with a simple red heart and one dark club; an oak leaf curls around the lower left. The whole mark must read clearly at 64 pixels, so use bold simple connected silhouettes, restrained interior detail and chunky pixel clusters rather than intricate illustration. Match a cosy 32-bit game aesthetic, crisp handcrafted square pixels, warm chestnut/moss/ivory/honey palette. Keep the icon vertically symmetric enough for a square app icon, centered inside a 1024x1024 image with generous equal transparent margin around every side. Fully transparent background outside emblem, no square backdrop, no words, no letters, no title, no watermark, no drop shadow outside the silhouette. No branding from existing games. Output just the one emblem.

## Animated cat and room effects

`game/assets/cat-free-room.png` is a built-in image edit of room-v2 that removes the painted cat while keeping its cushion and the room layout. `game/assets/cat-states.png` is an unchanged original image-generation output: 1774 × 887 RGBA, four columns by two rows, with transparent margins. Frames are sleep, starting stretch, full stretch, paw raised, paw licking, turning to window, watching window and curling back to sleep. CSS places them on the original cushion; no image pixels were rewritten in code. The exact prompts and validation are saved in **CAT_ART_PROMPTS.json**.

Rain, moving fire accents, local glows and chip piles are original canvas/CSS work; no new paid asset, sample or API was used.

## Woodland expansion

Clipper, Mur and Baron each have an original three-pose sheet generated with the built-in image tool. See WOODLAND_EXPANSION.md for prompts. Clipper’s revised pince-nez colour sheet is `game/assets/clipper-pince-nez.png`. It is composited with the original Clipper alpha silhouette, embedded in `game/clipper-mask.css` so native file-origin masking works without relaxing browser security. Original sheets are retained.

## Full seated cast revision

Current character atlases are `game/assets/{juniper,luma,moss,clipper,mur,baron}-seated-v3.png`. Each is an original built-in image-generation output, 2172 × 724 RGBA, containing playing, all-in and folded frames. Alpha transparency was checked in all six files. Clipper’s navy tailoring and snout-mounted pince-nez replace the mustard outfit and masked revision. No CSS image mask is loaded. Full prompts are in `SEATED_ART_PROMPTS.md`. Existing older art remains as unused source history. No paid stock assets or external API calls were used.

Luna and Clipper now load the anatomy/style-reviewed v4 sheets. See CHARACTER_ART_QC.md for final prompts and validation; their earlier v3 sheets remain unused source history.

