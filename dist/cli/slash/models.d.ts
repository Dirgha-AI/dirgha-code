/**
 * /models — list every model in the v2 price catalogue grouped by
 * provider, mark which providers are configured (env var present), and
 * allow picking one as the current model for the REPL. Accepts either
 * a numeric index or a full `provider/model` id.
 */
import type { SlashCommand } from "./types.js";
export declare const modelsCommand: SlashCommand;
