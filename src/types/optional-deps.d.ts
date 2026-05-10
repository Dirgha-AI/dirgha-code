// Minimal stubs for optional dependencies. TypeScript uses the real package
// types when installed; these stubs prevent TS2307 when packages are absent.

declare module "@xenova/transformers" {
  // The CLI casts to unknown before any property access (env, pipeline).
  // Only the module's existence is required by typeof import(...) usage.
  const transformers: any;
  export = transformers;
}

declare module "sqlite-vec" {
  // Only .load(db) is called on the imported value.
  export function load(db: any): void;
}
