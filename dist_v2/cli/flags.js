/**
 * Flag parser. Minimal but strict: supports --long, -s short flags,
 * --key=value and --key value. Unknown flags are returned as positionals
 * so callers can detect and reject them.
 */
export function parseFlags(argv) {
    const flags = {};
    const positionals = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--') {
            positionals.push(...argv.slice(i + 1));
            break;
        }
        if (arg.startsWith('--')) {
            const eq = arg.indexOf('=');
            if (eq >= 0) {
                flags[arg.slice(2, eq)] = arg.slice(eq + 1);
            }
            else {
                const key = arg.slice(2);
                const next = argv[i + 1];
                if (next !== undefined && !next.startsWith('-')) {
                    flags[key] = next;
                    i++;
                }
                else {
                    flags[key] = true;
                }
            }
        }
        else if (arg.startsWith('-') && arg.length > 1) {
            const key = arg.slice(1);
            const next = argv[i + 1];
            if (next !== undefined && !next.startsWith('-')) {
                flags[key] = next;
                i++;
            }
            else {
                flags[key] = true;
            }
        }
        else {
            positionals.push(arg);
        }
    }
    return { flags, positionals };
}
//# sourceMappingURL=flags.js.map