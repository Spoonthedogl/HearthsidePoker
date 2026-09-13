# Performance and display revision

Measured on 12 September 2026 on this computer: Ryzen 7 9700X, NVIDIA RTX 4070 SUPER, Windows 11, Unreal Engine 5.8.2. The display reported 1920 × 1080 at 100% Windows scaling. Tests use the packaged Development executable and local assets, with no server or network required.

## Display controls

Open the music/settings button, then **Display**. Choose Windowed or Fullscreen, a supported window size, and Native (100%), Balanced (85%), or Lighter (70%). Fullscreen is desktop borderless. F11 and Alt + Enter work while the game UI has focus. Preferences save across launches.

Native renders at the window's actual pixel dimensions, including after maximize. The smaller percentages intentionally reduce the rendered image; they can help lower-powered computers. Quality-only changes preserve maximize. Window-size changes restore a normal window at the requested size.

Native tests read the actual CEF texture, not just a selected setting:

| Mode | Output pixels | Rendered pixels |
|---|---:|---:|
| Windowed, Native | 1280 × 720 | 1280 × 720 |
| Maximized, Native | 1920 × 1009 | 1920 × 1009 |
| Maximized, 70% | 1920 × 1009 | 1344 × 706 |
| Fullscreen, Native | 1920 × 1080 | 1920 × 1080 |
| Fullscreen, 85% | 1920 × 1080 | 1632 × 918 |
| Fullscreen, 70% | 1920 × 1080 | 1344 × 756 |

Ten clicks routed through native Slate input arrived as trusted clicks on their intended controls, including Apply, close, and the bottom-right Fresh table button at 70%. A separate launch restored a saved 1280 × 720 window at 85%, with a 1088 × 612 backing texture. Tests used isolated settings folders and did not reset the player's table.

Windows per-monitor DPI awareness is enabled before window creation. This computer was tested at 100% Windows scaling; higher Windows scaling factors were not physically tested. The host uses Unreal's existing DPI calculation without multiplying DPI twice.

## Measured work and responsiveness

The original idle game presentation already ran at approximately 60 fps in the sampled 1600 × 900 warm launch. Unreal itself was drawing about 144 frames per second behind the browser. The revised host caps both at 60 fps and disables unused 3D world rendering. A clean native capture averaged 16.67 ms per host frame. This reduces unnecessary work; it is not a claim that gameplay previously ran at 144 fps.

The ambient layer retains all nine lights, the clipped rain, the same drawing resolution, and its 30 fps cadence. It caches eight glow stamps instead of rebuilding nine gradients every frame, clears 28,572 rather than 324,000 backing pixels, and issues about 187 rather than 266 drawing operations per frame. These are instrumented drawing counts: 91% fewer cleared pixels and about 30% fewer drawing operations, not measured percentages of GPU or battery savings. Six geometry, scheduling, cache, and coverage tests pass.

Hand-journal calculations now run asynchronously while current visible cards appear immediately. Ordinary browsers use a worker. The packaged local-file CEF environment restricts workers, so it uses identical calculations in small scheduled batches. In the native test, the previous synchronous 12,000-runout calculation occupied 31.9 ms; the revised path's longest main-thread batch was 4 ms, finishing in about 98 ms total. All probabilities and examples matched the original seeded calculation exactly, including all 1,081 flop runouts. Cancellation and stale-result guards prevent results from an old hand replacing the current guide. No opponent cards or actual deck order enter this calculation.

## Launch measurements and limits

Warm page-load timing was about 592 ms before and 575–625 ms in the initial revised runs. A brief first-paint long task appeared intermittently in both versions (69 ms before; zero or 78 ms afterward). These measurements do not establish faster cold process startup. They exclude Unreal initialization before the page starts loading. Screenshot capture is excluded from the clean host-frame comparison because saving a screenshot itself caused a diagnostic hitch.

The largest reproduced interaction hitch occurred on the first click: audio initialization took 141–154 ms, including 127–128 ms opening the audio device and about 21 ms preparing room sound. That produced a 147–161 ms UI task and a 133–150 ms presentation frame gap.

Audio now prepares its device, graph and unchanged sound buffers silently during initial loading. It remains suspended, with zero playing sources and no music scheduler, until an interaction requests activation. Two final native launches measured 0.1 and 0.3 ms in the first-click audio call, with no UI long tasks during the measured sitting sequence. The audio context became running and its two ambience loops started correctly. The 95th-percentile presentation frame interval remained 16.8 ms; an isolated 66.6–66.7 ms frame gap remained, so this does not claim that every startup or animation hitch has been eliminated.

The device-opening cost is moved into silent preparation rather than removed from total process startup. This can slightly increase initial readiness time, but avoids doing the work during the sitting animation or the first settings click. Seven tests cover silent warmup, pending suspension/resume races, visibility, failure, disposal, bounded deferred effects, and byte-for-byte sound-buffer/RNG preservation. All 14 existing sound-effect checks also pass.

Original-resolution art and the existing sound synthesis are retained. Lossless WebP candidates were evaluated but not adopted: they reduced file size while decoding slightly slower in the local CPU proxy, so a startup benefit was not established.

## Validation

Editor and packaged Windows builds pass. Native checks cover fullscreen, maximize, real render dimensions, pointer alignment, invalid-setting rejection, shortcuts, settings persistence, and exact asynchronous guide results. All native functional QA runs exited successfully. All 71 automated checks pass: 58 game-rule/guide/dialogue/AI/cat/computation checks, six ambient-rendering checks, and seven audio-preparation checks. Native runs additionally verified silent preparation and successful sound activation on a trusted first click.

The shipped folder contains the updated native executable and matching local runtime files. No engine installation files, system display settings, drivers, paid assets, or services were changed for this revision.
