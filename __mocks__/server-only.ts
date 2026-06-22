// 'server-only' is a build-time guard meant to be special-cased by Next's
// bundler (it throws if pulled into a client bundle). Plain Jest has no such
// bundler, so it's stubbed out here rather than removed from the real
// modules that legitimately want the guard (lib/session.ts).
export {}
