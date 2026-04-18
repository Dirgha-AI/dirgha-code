/**
 * agent/gateway.ts — Agent loop's entry to the provider dispatcher.
 *
 * Imports `callModel` directly from providers/dispatch (avoid the
 * circular via providers/index) and re-exports it as `callGateway`
 * for clarity inside the agent loop.
 */
import { callModel } from '../providers/dispatch.js';
export { getActiveProvider as detectProvider, getDefaultModel } from '../providers/detection.js';
export type { Provider } from '../providers/types.js';
export { callModel as callGateway };
