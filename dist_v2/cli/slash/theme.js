/**
 * /theme — switch the TUI theme. v2 currently ships a single theme
 * (defaultTheme) plus a noColour() helper; no runtime mutation API
 * is exposed. This command therefore stores the preference in
 * process.env.DIRGHA_THEME and ~/.dirgha/config.json so the next
 * process can honour it. STUB until the TUI grows a theme registry.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const THEMES = ['light', 'dark', 'none'];
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
    description: 'Show or pick TUI theme (light|dark|none) — preference only',
    async execute(args) {
        const current = process.env.DIRGHA_THEME ?? 'dark';
        if (args.length === 0) {
            return `Current theme: ${current}. Available: ${THEMES.join(', ')}. (v2 TUI uses a fixed theme — preference is stored for the future.)`;
        }
        const next = args[0];
        if (!THEMES.includes(next)) {
            return `Unknown theme "${next}". Choose one of: ${THEMES.join(', ')}`;
        }
        process.env.DIRGHA_THEME = next;
        const cfg = await readConfig();
        cfg.theme = next;
        await writeConfig(cfg);
        return `Theme preference saved as "${next}". Restart for it to take effect once themes are wired.`;
    },
};
//# sourceMappingURL=theme.js.map