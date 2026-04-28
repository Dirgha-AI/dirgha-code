/**
 * `dirgha hardware` — print machine profile + recommend top GGUF models
 * for that hardware. Read-only, no network. JSON output via --json.
 */
import { stdout } from 'node:process';
import { detectHardware, summariseHardware } from '../../setup/hardware-detect.js';
import { recommendModels } from '../../setup/model-curator.js';
import { defaultTheme, style } from '../../tui/theme.js';
export const hardwareSubcommand = {
    name: 'hardware',
    aliases: ['sysinfo', 'system'],
    description: 'Detect machine specs and recommend matching local models',
    async run(argv) {
        const json = argv.includes('--json');
        const hw = await detectHardware();
        const recs = recommendModels(hw, 5);
        if (json) {
            stdout.write(`${JSON.stringify({ hardware: hw, recommended: recs }, null, 2)}\n`);
            return 0;
        }
        stdout.write(`\n${style(defaultTheme.accent, '◈ dirgha hardware')}\n\n`);
        for (const line of summariseHardware(hw)) {
            stdout.write(`  ${line}\n`);
        }
        stdout.write('\n');
        if (recs.length === 0) {
            stdout.write(`  ${style(defaultTheme.warning, 'No GGUF model in the catalogue fits this hardware.')}\n`);
            stdout.write(`  ${style(defaultTheme.muted, 'Consider hosted providers — `dirgha setup` lists 17.')}\n\n`);
            return 0;
        }
        stdout.write(`  ${style(defaultTheme.accent, `Recommended local models for your hardware (${recs.length}):`)}\n\n`);
        for (const m of recs) {
            const gpu = m.minVramGB !== null ? `GPU ≥ ${m.minVramGB} GB` : 'CPU only';
            stdout.write(`    ${style(defaultTheme.accent, m.name.padEnd(22))} ${`${m.sizeGB} GB`.padEnd(8)} ${gpu.padEnd(12)} ${style(defaultTheme.muted, m.description)}\n`);
            stdout.write(`      ${style(defaultTheme.muted, `id: ${m.id}  ·  hf: ${m.hfRepo}`)}\n\n`);
        }
        stdout.write(`  ${style(defaultTheme.muted, 'To install one: `dirgha setup` → pick Local, or download manually from HuggingFace.')}\n\n`);
        return 0;
    },
};
//# sourceMappingURL=hardware.js.map