import type { EventStream } from "../../kernel/event-stream.js";
export interface ActiveTool {
    id: string;
    name: string;
    elapsedMs: number;
}
export declare function useToolProgress(events: EventStream): ActiveTool[];
