# iOS File-System Audit

## Scope

The app imports `react-native-file-system` only from `src/utils/fs.ts`. All
other callers use that file as the project file-system abstraction. The
dependency is the pinned Git revision in `package.json` and `package-lock.json`;
it exposes an Android native `FileSystemModule` and its Java implementation has
no iOS source files in the pinned revision.

## API inventory

| Abstraction API | Current use | Android implementation | iOS replacement/status |
| --- | --- | --- | --- |
| `Dirs.CacheDir` | Temporary files, logs, image metadata, export scratch files | `Context.getCacheDir()` | `react-native-fs.CachesDirectoryPath` |
| `Dirs.DocumentDir` | TrackPlayer cache migration and theme images | `Context.getFilesDir()` | `react-native-fs.DocumentDirectoryPath` |
| `Dirs.SDCardDir` | Root for the Android file browser | External storage root | No shared iOS storage; use app Documents as the manual-browser root |
| `FileSystem.ls` | File browser and local-media scan | Java/SAF-aware directory listing | `RNFS.readDir`, mapped to the app `FileType` shape |
| `FileSystem.exists` | Local-song and cache existence checks | Java/SAF-aware existence check | `RNFS.exists` |
| `FileSystem.mkdir` | Temporary image folder and user folders | Creates a directory and returns metadata | `RNFS.mkdir`, then `stat` |
| `FileSystem.unlink` | Delete temporary files, logs, cache folders | Recursive delete | `RNFS.unlink`; callers currently use files and one temporary directory |
| `FileSystem.stat` | File metadata, size, readable check | Returns `FileType` | `RNFS.stat`, mapped from methods/Date fields |
| `FileSystem.readFile` | JSON/user API import and decompression scratch files | UTF-8/base64 | `RNFS.readFile` |
| `FileSystem.writeFile` | JSON export and logs | UTF-8/base64 | `RNFS.writeFile` |
| `FileSystem.appendFile` | Error log append | UTF-8/base64 | `RNFS.appendFile` |
| `FileSystem.mv` | TrackPlayer cache migration | File/SAF move | `RNFS.moveFile` |
| `FileSystem.rename` | Exported abstraction; no current business call found | Java/SAF rename | Implemented as move to sibling name |
| `FileSystem.cp` | Not called by app abstraction today | Java/SAF copy | Available through the compatibility layer via `RNFS.copyFile` |
| `FileSystem.hash` | Exported abstraction; no current business call found | Java digest | `RNFS.hash` |
| `FileSystem.gzipFile` / `unGzipFile` | Backup/export files | Java GZIP streams | JS `pako` plus RNFS base64 reads/writes on iOS |
| `FileSystem.gzipString` / `unGzipString` | Sync protocol payloads | Java GZIP + base64 | JS `pako` plus `Buffer` |
| `getExternalStoragePaths` | Detect Android storage roots | Java external-storage enumeration | iOS returns the app Documents root only |
| `AndroidScoped.openDocumentTree` | Android persisted folder selection | Storage Access Framework | Android-only; iOS rejects with an explicit unsupported error |
| `AndroidScoped.openDocument` | Android system file selector | Storage Access Framework | Android-only; iOS rejects and callers fall back to manual mode |
| `getPersistedUriPermissions` / release | Android `content://` permission management | ContentResolver persisted grants | Android-only; iOS returns an empty list / rejects release |

## Path and URI findings

- Android may use ordinary filesystem paths and `content://` SAF URIs. Those
  URI operations stay on the Android branch and are not passed to RNFS.
- The app normalizes absolute local paths to `file://` only when presenting
  images/audio to React Native. No iOS implementation should add `content://`.
- iOS `Documents` is the writable, user-visible persistent app directory.
  It is the only reasonable root for the existing manual file browser.
- iOS `Library/Caches` is appropriate for logs, downloaded artwork, metadata
  scratch data, and other reproducible cache files. The OS may delete it.
- iOS `tmp` is appropriate for short-lived import/export and image-editing
  scratch files. The current abstraction uses the cache directory for these
  paths to preserve Android behavior; a future cleanup pass may split them.
- `Library` itself is available through RNFS but is not currently needed as a
  separate app path.

## Persistence classification

- Persistent: user-created music files, imported lists/user API files, theme
  assets, and TrackPlayer's migrated cache should be under Documents.
- Cache: downloaded artwork, local-media metadata cache, error logs, and
  recoverable download/update scratch files belong under Library/Caches.
- Temporary: metadata edit images and gzip intermediate files may use Caches
  today (or tmp in a later targeted cleanup).

## Compatibility decisions

`react-native-fs` covers every filesystem operation currently exercised by the
business code. The only non-equivalent APIs are Android SAF storage selection,
`content://` permissions, and the custom GZIP methods. The compatibility layer
therefore keeps the pinned Android module on Android, uses RNFS on iOS, maps
metadata to the existing `FileType` contract, and implements GZIP with the
already-present `pako` dependency. No dependency upgrade is required.

## Open items

- iOS document picking is not implemented by the existing dependencies. The
  current fallback is the app Documents browser; a native/document-picker
  feature can be evaluated separately.
- Real-device checks are still required for audio-file access, file URLs, and
  cache eviction after the first iOS build.
