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
import type { SlashCommand } from "./types.js";
export { getGoal, setGoal, clearGoal, updateGoalProgress, updateGoalStatus } from "../../context/goal.js";
export declare const goalCommand: SlashCommand;
