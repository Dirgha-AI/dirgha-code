/**
 * Canonical message and event types.
 *
 * Every layer above kernel consumes these types. Providers emit events,
 * tools consume tool-use parts and emit tool-result parts, surfaces render
 * events, the daemon streams events over RPC. One shape, everywhere.
 */
/**
 * Type guard: narrows ToolResult to its error branch.
 */
export function isToolError(r) {
    return r.isError === true;
}
/**
 * Type guard: narrows ToolResult to its success branch.
 */
export function isToolOk(r) {
    return r.isError === false;
}
//# sourceMappingURL=types.js.map