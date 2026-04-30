/**
 * Flag parser. Minimal but strict: supports --long, -s short flags,
 * --key=value and --key value. Unknown flags are returned as positionals
 * so callers can detect and reject them.
 *
 * Boolean flags (listed in BOOLEAN_FLAGS) never consume the next argv
 * token. This matters for `dirgha --json "prompt"` — without the
 * allowlist, "prompt" would be treated as the value of --json and
 * the actual prompt would be lost.
 */

export interface ParsedFlags {
  flags: Record<string, string | boolean>;
  positionals: string[];
}

const BOOLEAN_FLAGS = new Set<string>([
  'json',
  'print',
  'help',
  'h',
  'version',
  'V',
  'force',
  'verbose',
  'yolo',
]);

export function parseFlags(argv: string[]): ParsedFlags {
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

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
      } else {
        const key = arg.slice(2);
        if (BOOLEAN_FLAGS.has(key)) {
          flags[key] = true;
          continue;
        }
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const key = arg.slice(1);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { flags, positionals };
}
