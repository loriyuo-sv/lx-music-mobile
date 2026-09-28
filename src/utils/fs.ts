import { Platform } from 'react-native'
import RNFS from 'react-native-fs'
import { gzip, ungzip } from 'pako'
import { Buffer } from 'buffer'
import type * as AndroidFileSystemModule from 'react-native-file-system'

type Encoding = 'base64' | 'utf8'
type HashAlgorithm = 'md5' | 'sha1' | 'sha224' | 'sha256' | 'sha384' | 'sha512'

export interface FileType {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
  lastModified: number
  canRead: boolean
  data: string
  mimeType: string
  size: number
}

type AndroidFileSystem = typeof AndroidFileSystemModule

// Keep the Android SAF implementation isolated from iOS. Requiring it only on
// Android prevents its missing FileSystemModule proxy from running on iOS.
const androidFs: AndroidFileSystem | null = Platform.OS === 'android'
  // eslint-disable-next-line @typescript-eslint/no-var-requires -- Android-only module must not execute on iOS.
  ? require('react-native-file-system') as AndroidFileSystem
  : null

const isAndroid = Platform.OS === 'android'

export const temporaryDirectoryPath = isAndroid
  ? androidFs!.Dirs.CacheDir
  : RNFS.CachesDirectoryPath
export const externalStorageDirectoryPath = isAndroid
  ? androidFs!.Dirs.SDCardDir
  : RNFS.DocumentDirectoryPath
export const privateStorageDirectoryPath = isAndroid
  ? androidFs!.Dirs.DocumentDir
  : RNFS.DocumentDirectoryPath

const encodingOrDefault = (encoding?: Encoding): string => encoding ?? 'utf8'

const timestamp = (value: Date | number | undefined) => value instanceof Date ? value.getTime() : value ?? 0

const fileTypeFromRNFS = (item: RNFS.ReadDirItem | RNFS.StatResult, path: string): FileType => {
  const isDirectory = 'isDirectory' in item ? item.isDirectory() : false
  const isFile = 'isFile' in item ? item.isFile() : !isDirectory
  const lastModified = timestamp(item.mtime) || timestamp(item.ctime)
  return {
    name: item.name ?? '',
    path: item.path || path,
    isDirectory,
    isFile,
    lastModified,
    canRead: true,
    data: '',
    mimeType: '',
    size: Number(item.size ?? 0),
  }
}

const requireIosPath = (path: string) => {
  if (path.startsWith('content://')) throw new Error('content:// paths are Android-only')
  return path.startsWith('file://') ? path.slice('file://'.length) : path
}

export const extname = (name: string) => name.lastIndexOf('.') > 0 ? name.substring(name.lastIndexOf('.') + 1) : ''

const gzipFileIos = async(fromPath: string, toPath: string) => {
  const source = await RNFS.readFile(requireIosPath(fromPath), 'base64')
  const compressed = gzip(Buffer.from(source, 'base64'))
  await RNFS.writeFile(requireIosPath(toPath), Buffer.from(compressed).toString('base64'), 'base64')
}

const unGzipFileIos = async(fromPath: string, toPath: string) => {
  const source = await RNFS.readFile(requireIosPath(fromPath), 'base64')
  const decompressed = ungzip(Buffer.from(source, 'base64'))
  await RNFS.writeFile(requireIosPath(toPath), Buffer.from(decompressed).toString('base64'), 'base64')
}

export const getExternalStoragePaths = async(isRemovable?: boolean): Promise<string[]> => {
  if (!isAndroid) return [RNFS.DocumentDirectoryPath]
  return isRemovable == null
    ? androidFs!.getExternalStoragePaths()
    : androidFs!.getExternalStoragePaths(isRemovable)
}

export const selectManagedFolder = async(isPersist: boolean = false) => {
  if (!isAndroid) throw new Error('Managed folder selection is Android-only')
  return androidFs!.AndroidScoped.openDocumentTree(isPersist)
}

export const selectFile = async(options: AndroidFileSystemModule.OpenDocumentOptions) => {
  if (!isAndroid) throw new Error('System file selection is Android-only')
  return androidFs!.AndroidScoped.openDocument(options)
}

export const removeManagedFolder = async(path: string) => {
  if (!isAndroid) throw new Error('Managed folder permissions are Android-only')
  return androidFs!.AndroidScoped.releasePersistableUriPermission(path)
}

export const getManagedFolders = async(): Promise<string[]> => {
  if (!isAndroid) return []
  return androidFs!.AndroidScoped.getPersistedUriPermissions()
}

export const getPersistedUriList = getManagedFolders

export const readDir = async(path: string): Promise<FileType[]> => {
  if (isAndroid) return androidFs!.FileSystem.ls(path)
  const items = await RNFS.readDir(requireIosPath(path))
  return items.map(item => fileTypeFromRNFS(item, path))
}

export const unlink = async(path: string) => {
  if (isAndroid) return androidFs!.FileSystem.unlink(path)
  return RNFS.unlink(requireIosPath(path))
}

export const mkdir = async(path: string): Promise<FileType> => {
  if (isAndroid) return androidFs!.FileSystem.mkdir(path)
  await RNFS.mkdir(requireIosPath(path))
  return stat(path)
}

export const stat = async(path: string): Promise<FileType> => {
  if (isAndroid) return androidFs!.FileSystem.stat(path)
  const item = await RNFS.stat(requireIosPath(path))
  return fileTypeFromRNFS(item, path)
}

export const hash = async(path: string, algorithm: HashAlgorithm) => {
  if (isAndroid) return androidFs!.FileSystem.hash(path, algorithm)
  return RNFS.hash(requireIosPath(path), algorithm)
}

export const readFile = async(path: string, encoding?: Encoding) => {
  if (isAndroid) return androidFs!.FileSystem.readFile(path, encoding)
  return RNFS.readFile(requireIosPath(path), encodingOrDefault(encoding))
}

export const copyFile = async(fromPath: string, toPath: string) => {
  if (isAndroid) return androidFs!.FileSystem.cp(fromPath, toPath)
  return RNFS.copyFile(requireIosPath(fromPath), requireIosPath(toPath))
}

export const moveFile = async(fromPath: string, toPath: string) => {
  if (isAndroid) return androidFs!.FileSystem.mv(fromPath, toPath)
  return RNFS.moveFile(requireIosPath(fromPath), requireIosPath(toPath))
}

export const gzipFile = async(fromPath: string, toPath: string) => {
  if (isAndroid) return androidFs!.FileSystem.gzipFile(fromPath, toPath)
  return gzipFileIos(fromPath, toPath)
}

export const unGzipFile = async(fromPath: string, toPath: string) => {
  if (isAndroid) return androidFs!.FileSystem.unGzipFile(fromPath, toPath)
  return unGzipFileIos(fromPath, toPath)
}

export const gzipString = async(data: string, encoding?: Encoding) => {
  if (isAndroid) return androidFs!.FileSystem.gzipString(data, encoding)
  const source = encoding === 'base64' ? Buffer.from(data, 'base64') : Buffer.from(data, 'utf8')
  return Buffer.from(gzip(source)).toString('base64')
}

export const unGzipString = async(data: string, encoding?: Encoding) => {
  if (isAndroid) return androidFs!.FileSystem.unGzipString(data, encoding)
  const result = Buffer.from(ungzip(Buffer.from(data, 'base64')))
  return encoding === 'base64' ? result.toString('base64') : result.toString('utf8')
}

export const existsFile = async(path: string) => {
  if (isAndroid) return androidFs!.FileSystem.exists(path)
  return RNFS.exists(requireIosPath(path))
}

export const rename = async(path: string, name: string) => {
  if (isAndroid) return androidFs!.FileSystem.rename(path, name)
  const cleanPath = requireIosPath(path)
  const separator = cleanPath.lastIndexOf('/')
  if (separator < 0) throw new Error('Cannot rename a path without a parent directory')
  await RNFS.moveFile(cleanPath, `${cleanPath.slice(0, separator + 1)}${name}`)
  return true
}

export const writeFile = async(path: string, data: string, encoding?: Encoding) => {
  if (isAndroid) return androidFs!.FileSystem.writeFile(path, data, encoding)
  return RNFS.writeFile(requireIosPath(path), data, encodingOrDefault(encoding))
}

export const appendFile = async(path: string, data: string, encoding?: Encoding) => {
  if (isAndroid) return androidFs!.FileSystem.appendFile(path, data, encoding)
  return RNFS.appendFile(requireIosPath(path), data, encodingOrDefault(encoding))
}

export const downloadFile = (url: string, path: string, options: Omit<RNFS.DownloadFileOptions, 'fromUrl' | 'toFile'> = {}) => {
  if (!isAndroid) path = requireIosPath(path)
  if (!options.headers) {
    options.headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Mobile Safari/537.36',
    }
  }
  return RNFS.downloadFile({
    fromUrl: url,
    toFile: path,
    ...options,
  })
}

export const stopDownload = (jobId: number) => {
  RNFS.stopDownload(jobId)
}

export type { Encoding, HashAlgorithm }
