/**
 * `dirgha setup --features` — optional native feature installer.
 *
 * Installs:
 *   - better-sqlite3  (chat history + search)
 *   - qmd binary      (semantic doc search, vendored — reports absence only)
 *
 * Uses only Node built-ins: https module for downloads, zlib + tar parsing
 * for extraction. No new npm dependencies.
 *
 * Dispatch: called from `runSetup()` in setup.ts when `--features` is present.
 */
export declare function runFeatureSetup(): Promise<number>;
