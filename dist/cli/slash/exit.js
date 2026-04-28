/**
 * /exit, /quit — leave the REPL cleanly. Delegates to
 * SlashContext.exit(), which already closes readline and calls
 * process.exit with the supplied code.
 */
export const exitCommand = {
    name: 'exit',
    description: 'Exit the REPL',
    aliases: ['quit'],
    async execute(args, ctx) {
        const code = args[0] ? Number.parseInt(args[0], 10) : 0;
        ctx.exit(Number.isFinite(code) ? code : 0);
        return undefined;
    },
};
//# sourceMappingURL=exit.js.map