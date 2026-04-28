/**
 * /compact — request a manual compaction of the running transcript.
 * The REPL's SlashContext.compact() already holds the knobs needed to
 * run compaction against the live history; delegate to it.
 */
export const compactCommand = {
    name: 'compact',
    description: 'Summarise older turns to free up context budget',
    async execute(_args, ctx) {
        return ctx.compact();
    },
};
//# sourceMappingURL=compact.js.map