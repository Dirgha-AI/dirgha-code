/**
 * /history — show the prompt history from the current session. Reads
 * the session's JSONL log directly (via the context/session store in
 * ~/.dirgha/sessions) and filters down to `user` role messages.
 */
import { createSessionStore } from '../../context/session.js';
function firstText(message) {
    const c = message.content;
    if (typeof c === 'string')
        return c;
    if (Array.isArray(c)) {
        for (const part of c) {
            if (part.type === 'text' && typeof part.text === 'string')
                return part.text;
        }
    }
    return '';
}
export const historyCommand = {
    name: 'history',
    description: 'Show prompts from the current session',
    async execute(args, ctx) {
        const limit = args[0] ? Math.max(1, Number.parseInt(args[0], 10) || 20) : 20;
        const sessions = createSessionStore();
        const session = await sessions.open(ctx.sessionId);
        if (!session)
            return '(no session log found for this REPL)';
        const prompts = [];
        for await (const entry of session.replay()) {
            if (entry.type === 'message' && entry.message.role === 'user') {
                const text = firstText(entry.message).split('\n')[0];
                if (text)
                    prompts.push(`  ${entry.ts}  ${text.slice(0, 120)}`);
            }
        }
        if (prompts.length === 0)
            return '(no prompts yet)';
        const sliced = prompts.slice(-limit);
        return [`Last ${sliced.length} prompts:`, ...sliced].join('\n');
    },
};
//# sourceMappingURL=history.js.map