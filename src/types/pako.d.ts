declare module 'pako' {
  export function gzip(input: Uint8Array): Uint8Array
  export function ungzip(input: Uint8Array): Uint8Array
}
