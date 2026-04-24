/**
 * /theme — switch the readline TUI theme. Writes the preference to
 * `~/.dirgha/config.json` (consumed by future sessions) and flips the
 * live theme via `ctx.setTheme()`. The Ink TUI uses a static Ink
 * render tree and won't re-colourise live; a restart picks up the
 * new theme there.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const THEMES = ['dark', 'light', 'none'];
function configPath() {
    return join(homedir(), '.dirgha', 'config.json');
}
async function readConfig() {
    const text = await readFile(configPath(), 'utf8').catch(() => '');
    if (!text)
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        return {};
    }
}
async function writeConfig(cfg) {
    await mkdir(join(homedir(), '.dirgha'), { recursive: true });
    await writeFile(configPath(), JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}
export const themeCommand = {
    name: 'theme',
    description: 'Show or pick TUI theme (dark|light|none)',
    async execute(args, ctx) {
        const current = ctx.getTheme();
        if (args.length === 0) {
            return [
                `Current theme: ${current}`,
                `Available:     ${THEMES.join(' · ')}`,
            ].join('\n');
        }
        const next = args[0];
        if (!THEMES.includes(next)) {
            return `Unknown theme "${next}". Choose one of: ${THEMES.join(', ')}`;
        }
        process.env['DIRGHA_THEME'] = next;
        const cfg = await readConfig();
        cfg.theme = next;
        await writeConfig(cfg);
        ctx.setTheme(next);
        return `Theme set to ${next}. Readline REPL applies immediately; Ink TUI picks it up on restart.`;
    },
};
//# sourceMappingURL=theme.js.map