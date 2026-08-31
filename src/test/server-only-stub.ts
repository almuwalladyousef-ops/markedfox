// Stands in for the `server-only` package under vitest.
//
// The real package throws when it is imported from anywhere but a React
// Server Component — that is how a module holding the service-role key is
// kept out of the client bundle. There is no bundler in a unit test to make
// that judgement, so importing the real thing fails every server module's
// test rather than protecting anything. Aliased in vitest.config.ts; the
// guard is untouched in `next build`, which is where it does its work.
export {};
