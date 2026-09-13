// A server-shaped type as it arrives after JSON.stringify: every Date becomes
// the ISO string its toJSON() writes, and nothing else changes. The types in
// this package describe what the server holds in process, so the client reads
// each one through this rather than keeping a string-dated copy that could
// drift from it.
//
// The bare `T` makes the conditional distribute over a union, so
// `Date | null` becomes `string | null`; the mapped type is homomorphic, so an
// array stays an array and `?` and `readonly` stay where they were.
// `wire.typetest.ts` pins each of those.
export type Wire<T> = T extends Date
  ? string
  : T extends object
    ? { [K in keyof T]: Wire<T[K]> }
    : T;
