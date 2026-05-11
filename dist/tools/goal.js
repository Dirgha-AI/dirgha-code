/**
 * goal.ts — Persistent goal tools for the agent.
 *
 * The agent can read and update the user's persistent goal.
 * Stored in ~/.dirgha/goal.json.
 */
import { getGoal, setGoal, updateGoalProgress, updateGoalStatus } from "../context/goal.js";
export const goalGetTool = {
    name: "goal_get",
    description: "Read the user's persistent goal (if any). Shows title, progress, status.",
    inputSchema: { type: "object", properties: {} },
    async execute(_rawInput, _ctx) {
        const goal = await getGoal();
        if (!goal)
            return { isError: false, content: "No goal set." };
        return {
            isError: false,
            content: `Goal: ${goal.title} (${goal.progress}%, ${goal.status})`,
        };
    },
};
export const goalSetTool = {
    name: "goal_set",
    description: "Set the user's persistent goal. Use this when you understand what the user wants to achieve long-term.",
    inputSchema: {
        type: "object",
        properties: {
            title: { type: "string", description: "Goal title (required)." },
            description: { type: "string", description: "Optional detailed description." },
            tags: { type: "array", items: { type: "string" }, description: "Optional tags." },
        },
        required: ["title"],
    },
    async execute(rawInput, _ctx) {
        const input = rawInput;
        const goal = await setGoal(input);
        return { isError: false, content: `🎯 Goal set: ${goal.title}` };
    },
};
export const goalProgressTool = {
    name: "goal_progress",
    description: "Update the goal's progress percentage (0-100). Use this as you make progress toward the goal.",
    inputSchema: {
        type: "object",
        properties: {
            progress: { type: "integer", minimum: 0, maximum: 100, description: "Progress percentage (required)." },
            note: { type: "string", description: "Optional note about what was accomplished." },
        },
        required: ["progress"],
    },
    async execute(rawInput, _ctx) {
        const input = rawInput;
        const updated = await updateGoalProgress(input.progress);
        if (!updated)
            return { isError: false, content: "No goal set. Use goal_set first." };
        const note = input.note ? ` — ${input.note}` : "";
        return { isError: false, content: `🎯 Goal progress: ${input.progress}%${note}` };
    },
};
export const goalCompleteTool = {
    name: "goal_complete",
    description: "Mark the goal as complete (100%).",
    inputSchema: { type: "object", properties: {} },
    async execute(_rawInput, _ctx) {
        await updateGoalStatus("done");
        return { isError: false, content: "🎉 Goal complete!" };
    },
};
//# sourceMappingURL=goal.js.map