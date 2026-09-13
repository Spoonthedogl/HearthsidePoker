# Unreal build notes

Hearthside Poker is an Unreal Engine 5.8 C++ project. The native game mode owns the engine viewport and hosts the local, self-contained pixel-art presentation in Unreal's bundled Chromium/Slate browser. The poker rules, characters, guide and procedural sound live in `game/`, making them easy to edit without a C++ rebuild. No external browser, server, account, paid asset or internet connection is required to play.

## This computer

- Unreal Engine 5.8.2: `C:\Program Files\Epic Games\UE_5.8`
- Visual Studio 2026 Build Tools: MSVC 14.50.35717, x64
- Windows SDK: 10.0.22621.0
- Microsoft .NET Framework 4.8 Developer Pack was installed during project creation to satisfy Unreal Editor's SwarmInterface build dependency. It is a free Microsoft SDK; the downloaded installer had a valid Microsoft Corporation signature. The existing .NET runtime was not replaced.

The official developer-pack source is [Microsoft's .NET Framework 4.8 download](https://dotnet.microsoft.com/en-us/download/dotnet-framework/thank-you/net48-developer-pack-offline-installer).

## Build and edit

Run `Build Project.ps1` in PowerShell to rebuild the editor module. The engine path can be overridden with `-EngineRoot`. Then open `HearthsidePoker.uproject` and press Play, or use `Launch Game.cmd` to run directly in Unreal.

`Package Game.ps1` builds and cooks the native Win64 game. All files below `game/` are staged as loose, local runtime dependencies because Chromium must read them directly. Make final changes to `game/` before packaging. The project uses the engine's built-in empty Entry map and the native `HearthsidePokerGameMode` class, so no downloaded template content is required.

The renderer defaults to DirectX 11, 1600 × 900 windowed, with both the Unreal host and browser capped at 60 fps. Unused 3D world rendering is disabled while the browser owns the view. Windows per-monitor DPI awareness is enabled before window creation. The project uses a scaled `FWebBrowserViewport` attached to `SWebBrowserView`; quality settings change the actual CEF texture and preserve pointer alignment.

The in-game Settings → Display panel applies Windowed, Borderless window, desktop fullscreen, window size, and 100/85/70% render quality through a bound native UObject. F11 and Alt+Enter are handled by Slate even while the browser has keyboard focus. Preferences live in GameUserSettings.ini, including HearthsidePoker.Display.RenderScalePercent and independent Layout_windowed_* and Layout_borderless_* position/dimension keys. Existing unlimited frame-rate preferences migrate to 60 fps. Audible sound still starts on the first user interaction.

## Windows application identity

The approved `game/assets/hearthside-icon.png` is exported without artistic changes to `Build/Windows/Application.ico`, with 16, 24, 32, 48, 64, 128 and 256 pixel frames. Unreal embeds this file into the game executable at build time and the bootstrap executable at staging time. `ProjectDisplayedTitle` sets the native window title to **Hearthside Poker**.

After replacing the ICO, build the game target with `-NoUBTMakefiles` and stage again so both executable icons update. `game/assets/room-v2.png` contains the room-layout revision; the original `room.png` is retained as an editable reference.

Borderless windows use native edge hit testing, a frame-free client area, and system Move/Resize commands. Window positions are captured in outer-window coordinates and restored within the current monitor work area. Mode changes push state to the browser even when dimensions do not change. See TABLE_IMPROVEMENTS.md for the latest validation.
