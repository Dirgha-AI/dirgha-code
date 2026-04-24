/**
 * /mode — switch the REPL's execution mode. v2 doesn't yet ship a
 * mode subsystem (plan / act / verify), so this is a structured stub
 * that records the preferred mode in process.env.DIRGHA_MODE so
 * downstream integrations can observe it. STUB until packages/core
 * grows a mode kernel.
 */
const MODES = ['plan', 'act', 'verify'];
export const modeCommand = {
    name: 'mode',
    description: 'Show or switch execution mode (plan|act|verify) — stub',
    async execute(args) {
        const current = process.env.DIRGHA_MODE ?? 'act';
        if (args.length === 0) {
            return `Current mode: ${current}. Available: ${MODES.join(', ')}. (v2 doesn\'t yet gate behaviour on mode — this is a stub.)`;
        }
        const next = args[0];
        if (!MODES.includes(next)) {
            return `Unknown mode "${next}". Choose one of: ${MODES.join(', ')}`;
        }
        process.env.DIRGHA_MODE = next;
        return `Mode set to ${next}. (Note: v2 does not yet route on mode.)`;
    },
};
//# sourceMappingURL=mode.js.map