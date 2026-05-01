/**
 * /cost — show cumulative token usage and estimated cost for the current
 * session. Reads the live totals tracked by the REPL or TUI context.
 */
export const costCommand = {
    name: "cost",
    description: "Show cumulative token usage and estimated cost",
    execute(_args, ctx) {
        return ctx.showCost();
    },
};
//# sourceMappingURL=cost.js.map