/**
 * shims barrel — Bun bundler runtime equivalents.
 *
 * These shims are only applicable when NOT running in a Bun-bundled
 * environment. In that context the real bun:bundle module provides
 * the feature() function and MACRO global at build time.
 */

// Conditionally re-export feature flags — only works in Node (not Bun's
// bundled context where bun:bundle is a compile-time alias).
let _bunBundleAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require.resolve('bun:bundle');
  _bunBundleAvailable = true;
} catch {
  // Not available — safe to use shim
}

export { feature } from './bun-bundle.js';
export { default as MACRO_OBJ } from './macro.js';