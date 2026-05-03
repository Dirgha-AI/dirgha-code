/**
 * `dirgha ping` — measure round-trip latency to the current model provider.
 *
 * Sends a minimal chat completion ("Say 'ok'") and reports how long the
 * first response token and the full response took.
 */
import { performance } from 'node:perf_hooks';
import { stdout } from 'node:process';
import { loadConfig } from '../config.js';
import { ProviderRegistry } from '../../providers/index.js';
import { style, defaultTheme } from '../../tui/theme.js';
export const pingSubcommand = {
    name: 'ping',
    description: 'Send a minimal chat completion and measure latency',
    async run(_argv, ctx) {
        const config = await loadConfig(ctx.cwd);
        const registry = new ProviderRegistry();
        const provider = registry.forModel(config.model);
        const startTime = performance.now();
        let firstTokenMs = 0;
        let textLen = 0;
        try {
            const stream = provider.stream({
                model: config.model,
                messages: [{ role: 'user', content: 'Reply with exactly the word "ok".' }],
                maxTokens: 10,
            });
            for await (const evt of stream) {
                if (evt.type === 'text_delta') {
                    if (firstTokenMs === 0)
                        firstTokenMs = performance.now() - startTime;
                    textLen += evt.delta.length;
                }
            }
        }
        catch (err) {
            stdout.write(`${style(defaultTheme.danger, '✗ Ping failed')}\n`);
            stdout.write(`  ${style(defaultTheme.muted, String(err))}\n`);
            return 1;
        }
        const totalMs = performance.now() - startTime;
        stdout.write(`${style(defaultTheme.accent, 'dirgha ping')}\n`);
        stdout.write(`  ${'model'.padEnd(16)} ${config.model}\n`);
        stdout.write(`  ${'first token'.padEnd(16)} ${firstTokenMs.toFixed(0)} ms\n`);
        stdout.write(`  ${'total'.padEnd(16)} ${totalMs.toFixed(0)} ms\n`);
        stdout.write(`  ${'response length'.padEnd(16)} ${textLen} chars\n`);
        return 0;
    },
};
//# sourceMappingURL=ping.js.map