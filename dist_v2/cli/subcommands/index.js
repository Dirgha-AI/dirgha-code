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
import { undoSubcommand } from './undo.js';
import { updateSubcommand } from './update.js';
import { auditCodebaseSubcommand } from './audit-codebase.js';
import { kbSubcommand } from './kb.js';
import { hardwareSubcommand } from './hardware.js';
import { webSubcommand } from './web.js';
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
];
export function findSubcommand(verb) {
    return subcommands.find(cmd => cmd.name === verb || (cmd.aliases ?? []).includes(verb));
}
export { runLogin, runLogout, runSetup };
export { loginSubcommand, logoutSubcommand, setupSubcommand, doctorSubcommand, auditSubcommand, statsSubcommand, statusSubcommand, initSubcommand, keysSubcommand, modelsSubcommand, chatSubcommand, askSubcommand, compactSubcommand, exportSessionSubcommand, importSessionSubcommand, };
//# sourceMappingURL=index.js.map