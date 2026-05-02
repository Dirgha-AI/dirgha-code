/**
 * fleet/scratchpad-tools.ts — fleet_note and fleet_read tools.
 *
 * These are injected by runner.ts into each fleet agent's ToolRegistry.
 * They are NOT in builtInTools — they only exist inside fleet runs.
 *
 * The ScratchpadHandle and agentId are bound via createScratchpadTools()
 * at agent-spawn time; the tool's execute() accesses them from closure.
 */
import { appendNote, readNotes, formatNotes, } from "./scratchpad.js";
export function createScratchpadTools(handle, agentId) {
    const fleetNote = {
        name: "fleet_note",
        description: "Write a note to the shared fleet scratchpad so other parallel agents can read it. " +
            "Use this when you discover a critical file path, key fact, or blocking issue. " +
            "Notes are immediately visible to all agents in the same fleet run.",
        inputSchema: {
            type: "object",
            properties: {
                text: {
                    type: "string",
                    description: "The fact or finding to record. Max 2000 chars.",
                },
                kind: {
                    type: "string",
                    enum: ["note", "file_found", "hypothesis", "result"],
                    description: "Category of note. Default: note.",
                },
                tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional facets for filtering, e.g. [\"auth\", \"db\"].",
                },
            },
            required: ["text"],
        },
        async execute(raw) {
            const input = raw;
            const kind = input.kind ?? "note";
            await appendNote(handle, agentId, kind, input.text, input.tags);
            return { content: "Noted.", isError: false };
        },
    };
    const fleetRead = {
        name: "fleet_read",
        description: "Read notes from the shared fleet scratchpad left by other parallel agents. " +
            "Check this early in your work to avoid re-discovering things other agents already found.",
        inputSchema: {
            type: "object",
            properties: {
                limit: {
                    type: "number",
                    description: "Last N entries to return. Default: 20.",
                },
                kind: {
                    type: "string",
                    enum: ["note", "file_found", "hypothesis", "result"],
                    description: "Filter by kind.",
                },
            },
        },
        async execute(raw) {
            const input = raw;
            const entries = await readNotes(handle, {
                limit: input.limit ?? 20,
                kind: input.kind,
            });
            return { content: formatNotes(entries), isError: false };
        },
    };
    return [fleetNote, fleetRead];
}
//# sourceMappingURL=scratchpad-tools.js.map