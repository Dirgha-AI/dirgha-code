/**
 * /goal — persistent objective tracking
 *
 * Subcommands:
 *   set <title>     — set a persistent goal
 *   view            — show the current goal
 *   progress <0-100> — update progress percentage
 *   pause / resume  — toggle goal active state
 *   done            — mark goal complete
 *   clear           — remove the goal
 */
import { getGoal, setGoal, clearGoal, updateGoalProgress, updateGoalStatus } from "../../context/goal.js";
export { getGoal, setGoal, clearGoal, updateGoalProgress, updateGoalStatus } from "../../context/goal.js";
export const goalCommand = {
    name: "goal",
    description: "Set/view/update the persistent goal. Stored across sessions.",
    aliases: ["objective"],
    async execute(args, ctx) {
        const sub = args[0] ?? "view";
        const write = ctx?.write ?? ((s) => process.stdout.write(s + "\n"));
        if (sub === "set" || sub === "new") {
            const title = args.slice(1).join(" ");
            if (!title)
                return "Usage: /goal set <description of your goal>";
            const goal = await setGoal({ title });
            return `Goal set: ${goal.title}`;
        }
        if (sub === "view" || sub === "show") {
            const goal = await getGoal();
            if (!goal)
                return "No goal set. Use /goal set <description> to set one.";
            const statusIcon = goal.status === "done" ? "✅" :
                goal.status === "paused" ? "⏸" : "🎯";
            let out = `${statusIcon} Goal: ${goal.title} (${goal.progress}%, ${goal.status})`;
            if (goal.description)
                out += `\n   ${goal.description}`;
            out += `\n   Created: ${goal.created.slice(0, 10)}`;
            return out;
        }
        if (sub === "progress") {
            const pct = parseInt(args[1], 10);
            if (isNaN(pct) || pct < 0 || pct > 100)
                return "Usage: /goal progress <0-100>";
            const updated = await updateGoalProgress(pct);
            if (!updated)
                return "No goal set.";
            return `Goal progress updated to ${pct}%.`;
        }
        if (sub === "pause") {
            const g = await updateGoalStatus("paused");
            if (!g)
                return "No goal set.";
            return "Goal paused.";
        }
        if (sub === "resume") {
            const g = await updateGoalStatus("active");
            if (!g)
                return "No goal set.";
            return "Goal resumed.";
        }
        if (sub === "done" || sub === "complete") {
            const g = await updateGoalStatus("done");
            if (!g)
                return "No goal set.";
            return "Goal marked complete. 🎉";
        }
        if (sub === "clear" || sub === "delete" || sub === "remove") {
            await clearGoal();
            return "Goal cleared.";
        }
        return `Unknown subcommand: ${sub}. Available: set, view, progress, pause, resume, done, clear`;
    },
};
//# sourceMappingURL=goal.js.map