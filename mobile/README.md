# Hearthside Poker — Android app

This folder packages the web game in `../game` as an installable Android app,
using [Capacitor](https://capacitorjs.com). The app is a thin native shell
around a full-screen WebView that loads the **same** HTML/JS/CSS the browser and
Windows builds use — the game files are bundled inside the app, so it runs
entirely offline with no server, account or internet connection.

The result is a normal signed APK you install by opening it on the phone (a
"sideload"). It is **not** on the Google Play Store — publishing there costs a
one-time Google fee. There is no iOS build here: a distributable iPhone `.ipa`
requires a Mac and a paid Apple Developer account, so on iPhone the game is
installed instead with Safari's **Add to Home Screen** (see the top-level
README).

## What's in here

- `capacitor.config.json` — app id (`com.hearthside.poker`), name and web dir.
- `sync-web.mjs` — copies `../game` into `dist/` (the bundled web root),
  leaving out `tests/`, `.claude/` and the web-only `sw.js`.
- `assets/` — the 1024px icon (plain, foreground, background) and splash
  images that `@capacitor/assets` turns into every Android density.
- `android/` — the generated native Android project (committed).
- `dist/`, `node_modules/`, build outputs and any keystore are **git-ignored**.

## Prerequisites

- **Node** 18+.
- **JDK 21** (Capacitor 7 requires it).
- **Android SDK** with `platform-tools`, `platforms;android-35`,
  `build-tools;35.0.0`. Point Gradle at it via `android/local.properties`
  (`sdk.dir=...`) or the `ANDROID_HOME` environment variable.

No Android Studio is required; the command-line SDK tools are enough.

## Build a release APK

```bash
npm install                 # first time only
node sync-web.mjs           # refresh dist/ from ../game
npx cap sync android        # copy web assets + native config into android/
cd android && ./gradlew.bat assembleRelease
```

That produces an **unsigned** APK at
`android/app/build/outputs/apk/release/app-release-unsigned.apk`. Align and sign
it with the release key (see below):

```bash
zipalign -f -p 4 app-release-unsigned.apk app-release-aligned.apk
apksigner sign --ks <keystore> --ks-key-alias hearthside \
  --out Hearthside-Poker-<version>.apk app-release-aligned.apk
apksigner verify --print-certs Hearthside-Poker-<version>.apk
```

`zipalign` and `apksigner` live in `build-tools/35.0.0`.

## Signing key

The APK is signed with a self-managed keystore. It is deliberately **kept
outside this repository** (it is a secret) and is git-ignored here. Every update
that should install over an existing install must be signed with the **same**
key — keep it and its password backed up. If it is lost, users would have to
uninstall the old app before installing a new one.

Certificate: `CN=Hearthside Poker` · SHA-256
`25:A4:E7:98:6D:4E:3D:D9:28:A8:39:3E:B4:3B:82:02:AB:19:32:A5:66:62:08:34:5E:C8:CC:C9:AE:8C:E7:8E`.

## Cutting a new version

1. Update `../game` (the game itself) as usual.
2. Bump `versionName`/`versionCode` in `android/app/build.gradle`, the
   `version` in `package.json`, and the `CACHE` string in `../game/sw.js`.
3. Rebuild and sign as above, and attach the APK to the GitHub release.
