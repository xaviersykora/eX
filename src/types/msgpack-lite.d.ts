declare module 'msgpack-lite' {
  export function encode(input: unknown): Buffer;
  export function decode(input: Buffer | Uint8Array): unknown;
}
