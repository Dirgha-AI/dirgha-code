/**
 * goal.ts — Persistent goal/objective store at ~/.dirgha/goal.json
 *
 * A single persistent objective that survives restarts. The agent can
 * reference it, update progress, and the user can set/view/clear/pause
 * it via the /goal slash command.
 *
 * Mirrors the tasks/memory/credentials atomic-tmp+rename pattern.
 */
export interface Goal {
    title: string;
    description?: string;
    progress: number;
    status: "active" | "paused" | "done";
    tags?: string[];
    created: string;
    updated: string;
}
export declare function getGoal(): Promise<Goal | null>;
export declare function setGoal(opts: {
    title: string;
    description?: string;
    tags?: string[];
}): Promise<Goal>;
export declare function updateGoalProgress(progress: number): Promise<Goal | null>;
export declare function updateGoalStatus(status: "active" | "paused" | "done"): Promise<Goal | null>;
export declare function clearGoal(): Promise<void>;
