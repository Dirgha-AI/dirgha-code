/**
 * /mode — switch the REPL's execution mode. The mode is prepended to
 * the system prompt of every subsequent turn via the interactive loop,
 * which reads ctx.mode / ctx.setMode on each submit. Preference
 * persists to ~/.dirgha/config.json so new sessions honour it.
 */
import { MODES, saveMode, modePreamble } from '../../context/mode.js';
export const modeCommand = {
    name: 'mode',
    description: 'Show or switch execution mode (plan|act|verify)',
    async execute(args, ctx) {
        const current = ctx.getMode();
        if (args.length === 0) {
            return [
                `Current mode: ${current}`,
                `Available:    ${MODES.join(' · ')}`,
                '',
                modePreamble(current),
            ].join('\n');
        }
        const next = args[0];
        if (!MODES.includes(next)) {
            return `Unknown mode "${next}". Choose one of: ${MODES.join(', ')}`;
        }
        await saveMode(next);
        ctx.setMode(next);
        return `Mode set to ${next}. ${next === 'plan' ? '(Read-only — no writes or shells.)' : next === 'verify' ? '(Read-only audit — no modifications.)' : '(Normal execution.)'}`;
    },
};
//# sourceMappingURL=mode.js.map