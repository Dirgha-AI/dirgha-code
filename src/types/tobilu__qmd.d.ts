// Type stub for @tobilu/qmd — no upstream types published.
// https://github.com/tobi/qmd
declare module "@tobilu/qmd" {
  export interface QmdStore {
    search(query: string, opts?: { n?: number }): Promise<QmdResult[]>;
    query(query: string, opts?: { n?: number }): Promise<QmdResult[]>;
    get(id: string): Promise<QmdResult | null>;
    embed(text: string): Promise<number[]>;
  }

  export interface QmdResult {
    content: string;
    score: number;
    path?: string;
    id?: string;
    metadata?: Record<string, unknown>;
  }

  export function createStore(collectionPath: string): Promise<QmdStore>;
  export function addCollection(name: string, path: string): Promise<void>;
}
