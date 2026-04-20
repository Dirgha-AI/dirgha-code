import { MeshContext } from './types.js';

let context: MeshContext = {};

export function getContext(): MeshContext {
  return context;
}

export function setContext(newContext: MeshContext): void {
  context = newContext;
}

export function resetContext(): void {
  context = {};
}
