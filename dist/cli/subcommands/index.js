import { doctorSubcommand } from './doctor.js';
import { loginSubcommand, runLogin } from './login.js';
import { logoutSubcommand, runLogout } from './logout.js';
import { setupSubcommand, runSetup } from './setup.js';
import { auditSubcommand } from './audit.js';
import { statsSubcommand } from './stats.js';
import { statusSubcommand } from './status.js';
import { initSubcommand } from './init.js';
import { keysSubcommand } from './keys.js';
import { modelsSubcommand } from './models.js';
import { chatSubcommand } from './chat.js';
import { askSubcommand } from './ask.js';
import { compactSubcommand } from './compact.js';
import { exportSessionSubcommand } from './export-session.js';
import { importSessionSubcommand } from './import-session.js';
import { memorySubcommand } from './memory.js';
import { verifySubcommand } from './verify.js';
import { resumeSubcommand } from './resume.js';
import { skillsSubcommand } from './skills.js';
import { ledgerSubcommand } from './ledger.js';
import { costSubcommand } from './cost.js';
import { scaffoldSubcommand } from './scaffold.js';
import { telemetrySubcommand } from './telemetry.js';
import { undoSubcommand } from './undo.js';
import { updateSubcommand } from './update.js';
import { auditCodebaseSubcommand } from './audit-codebase.js';
import { kbSubcommand } from './kb.js';
import { hardwareSubcommand } from './hardware.js';
import { webSubcommand } from './web.js';
import { stateSubcommand } from './state.js';
import { historySubcommand } from './history.js';
import { voiceSubcommand } from './voice.js';
import { gpuSubcommand } from './gpu.js';
import { pingSubcommand } from './ping.js';
import { registerSubcommand } from './register.js';
import { nodeSubcommand } from './node.js';
export const subcommands = [
    doctorSubcommand,
    loginSubcommand,
    logoutSubcommand,
    setupSubcommand,
    auditSubcommand,
    statsSubcommand,
    statusSubcommand,
    initSubcommand,
    keysSubcommand,
    modelsSubcommand,
    memorySubcommand,
    ledgerSubcommand,
    costSubcommand,
    scaffoldSubcommand,
    telemetrySubcommand,
    undoSubcommand,
    updateSubcommand,
    auditCodebaseSubcommand,
    kbSubcommand,
    skillsSubcommand,
    verifySubcommand,
    chatSubcommand,
    askSubcommand,
    compactSubcommand,
    exportSessionSubcommand,
    importSessionSubcommand,
    resumeSubcommand,
    hardwareSubcommand,
    webSubcommand,
    stateSubcommand,
    historySubcommand,
    pingSubcommand,
    voiceSubcommand,
    gpuSubcommand,
    registerSubcommand,
    nodeSubcommand,
];
export function findSubcommand(verb) {
    return subcommands.find(cmd => cmd.name === verb || (cmd.aliases ?? []).includes(verb));
}
// Verbs dispatched directly in main.ts before findSubcommand is called.
const TOP_LEVEL_VERBS = ['login', 'logout', 'setup', 'auth', 'fleet', 'orchestra', 'submit-paper'];
function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_i, i) => Array.from({ length: n + 1 }, (_j, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    return dp[m][n];
}
/**
 * Returns the closest known command name if the given verb is an unrecognised
 * typo with edit distance ≤ 2 to any known subcommand name, alias, or top-level
 * verb. Returns undefined if the verb is an exact match (caller handles it) or
 * if no close-enough candidate exists.
 */
export function suggestCommand(verb) {
    // Exact match — caller dispatches normally, no suggestion needed.
    if (findSubcommand(verb))
        return undefined;
    if (TOP_LEVEL_VERBS.includes(verb))
        return undefined;
    // Build the candidate pool: all subcommand names + aliases + top-level verbs.
    const candidates = [
        ...TOP_LEVEL_VERBS,
        ...subcommands.flatMap(cmd => [cmd.name, ...(cmd.aliases ?? [])]),
    ];
    let best;
    let bestDist = Infinity;
    for (const candidate of candidates) {
        const d = levenshtein(verb, candidate);
        if (d < bestDist) {
            bestDist = d;
            best = candidate;
        }
    }
    return bestDist <= 2 ? best : undefined;
}
export { runLogin, runLogout, runSetup };
export { loginSubcommand, logoutSubcommand, setupSubcommand, doctorSubcommand, auditSubcommand, statsSubcommand, statusSubcommand, pingSubcommand, initSubcommand, keysSubcommand, modelsSubcommand, chatSubcommand, askSubcommand, compactSubcommand, exportSessionSubcommand, importSessionSubcommand, };
//# sourceMappingURL=index.js.map