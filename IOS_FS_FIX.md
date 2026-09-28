# iOS File-System Compatibility Fix

## 1. Original problem

The signed IPA installed on a real iPhone, but the JavaScript bundle crashed
at startup with:

> The package `react-native-file-system` doesn't seem to be linked.

`src/utils/fs.ts` imported that package unconditionally. The pinned package
revision contains an Android Java implementation and its JS module throws when
`NativeModules.FileSystemModule` is absent. The iOS build therefore succeeded,
but the first filesystem constant access failed at runtime.

## 2. Root cause

This was a runtime native-module availability problem, not a signing or IPA
packaging problem. `react-native-file-system`'s public API is broader than the
filesystem API used by the app and includes Android Storage Access Framework
operations that have no iOS equivalent.

## 3. Files changed

- `src/utils/fs.ts`: platform compatibility layer.
- `IOS_FS_AUDIT.md`: API, path, and persistence audit.
- `IOS_FS_FIX.md`: this implementation and verification report.

No Android Java/Kotlin, player, QuickJS, UI, or business files were changed.
No dependency version was upgraded and no new dependency was added.

## 4. Android compatibility

On Android, the compatibility layer requires and delegates to the existing
pinned `react-native-file-system` implementation. Android paths, SAF
`content://` handling, persisted folder permissions, download behavior, and
gzip behavior remain on that original branch.

On iOS, the Android package is not required at runtime. The iOS branch uses the
already-present `react-native-fs` dependency and maps its metadata into the
existing `FileType` contract expected by the UI.

## 5. iOS implementation

`react-native-fs` supplies Documents, Caches, directory listing, stat, read,
write, append, move, copy, delete, hash, and download operations. Existing
`pako` supplies gzip/ungzip for files and sync strings through base64. `file://`
paths are normalized before RNFS calls; `content://` paths are rejected on iOS
because they are Android-only.

The iOS manual browser root is Documents. Caches is used for the existing
temporary/cache paths. Android system file selection and persisted SAF folder
permissions explicitly remain Android-only and return a clear unsupported
error on iOS; the existing caller can fall back to its manual path flow.

## 6. API comparison

| API group | Android | iOS |
| --- | --- | --- |
| Paths | `Dirs.CacheDir`, `Dirs.DocumentDir`, `Dirs.SDCardDir` | RNFS Caches, Documents, Documents-as-browser-root |
| File operations | Original `FileSystem.*` | RNFS equivalents mapped to `FileType` |
| GZIP | Original Java implementation | JS `pako` implementation |
| Downloads | Existing RNFS wrapper | Same RNFS wrapper with iOS path normalization |
| SAF picker/permissions | Supported | Explicitly unsupported in this phase |

## 7. iOS path design

- Documents: persistent user content, themes, and the app's manual file browser.
- Library/Caches: recoverable cache, logs, artwork, metadata scratch, and
  temporary download/update files.
- tmp: available for a later cleanup refinement; current paths preserve the
  existing cache semantics to avoid changing business behavior.

## 8. Build result

Local validation before the macOS run:

- Focused TypeScript validation: `src/utils/fs.ts` has no TypeScript errors.
  A full-project `tsc --noEmit` remains blocked by pre-existing project errors,
  including missing type declarations from the interrupted local Git dependency
  install (`react-native-track-player` and `react-native-local-media-metadata`),
  timer typings, and existing player `Track` shape errors. No player code was
  changed to conceal these failures.
- Focused ESLint: `src/utils/fs.ts` passes.
- Android Debug build: not runnable on this Windows host because neither
  `JAVA_HOME` nor `java` is configured. This is an environment prerequisite,
  not an Android source failure; the macOS CI run remains the authoritative
  build verification.
- GitHub Actions Run #5: completed successfully on `macos-15` for commit
  `18e2a355e2f09b4fae47e9888630058efea951dd`.
- `pod install`: succeeded (4m 6s).
- iOS Release `xcodebuild`: succeeded (8m 28s) with
  `CODE_SIGNING_ALLOWED=NO`, `CODE_SIGNING_REQUIRED=NO`, and an empty
  `CODE_SIGN_IDENTITY`. The target is `LxMusicMobile`, configuration is
  `Release`, and the Bundle ID is `com.lxmusic.mobile`.
- IPA validation: succeeded. The workflow verifies the built executable,
  `Payload/LXMusic.app/Info.plist`, and the absence of `_CodeSignature` and
  `embedded.mobileprovision` before uploading.

The sole job annotation is GitHub's runner warning that several actions still
target the deprecated Node.js 20 runtime and are forced to Node.js 24. It is
not an application, CocoaPods, or Xcode compilation error.

## 9. IPA result

A new unsigned IPA was generated and uploaded after the Release build passed:

- GitHub Actions run: `36446162039`
- Artifact: `ios-unsigned-ipa-36446162039`
- Artifact size: 9.73 MB
- Artifact SHA-256: `98919af58d6d407f6b736db1cf3e1921d64982d28eddda62efb4aeac0b774e79`
- Structure verified by the workflow: `Payload/LXMusic.app/`
- Signing state: unsigned; no embedded provisioning profile or code signature
- Build logs artifact: `ios-build-logs-36446162039` (689 KB)

## 10. Next real-device checks

1. Launch the new signed IPA on the iPhone and confirm the startup error is gone.
2. Search, play, pause, and cache a song.
3. Import/export a list and a user API file.
4. Edit/download artwork and verify temporary cleanup.
5. Confirm theme images and TrackPlayer cache survive relaunch.
6. Verify that the Android SAF browser and `content://` flows remain unchanged.

The existing Android-only notification/native-module issues and iOS document
picker/security-scoped URL work are outside this focused filesystem fix and
remain follow-up items if encountered during device testing.
