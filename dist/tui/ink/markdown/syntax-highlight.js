/**
 * Syntax highlighting for tool result output (e.g. fs_read of code files).
 *
 * When the agent reads a code file via fs_read, the raw output is
 * tokenized and can be rendered with appropriate theme colours.
 */
import { tokenize } from "./langs/index.js";
const EXT_TO_LANG = {
    ".ts": "ts",
    ".tsx": "tsx",
    ".js": "js",
    ".jsx": "jsx",
    ".mjs": "js",
    ".cjs": "js",
    ".py": "py",
    ".pyw": "py",
    ".rs": "rust",
    ".go": "go",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".sh": "sh",
    ".bash": "sh",
    ".zsh": "sh",
    ".md": "markdown",
};
export function extensionFromArgSummary(argSummary) {
    const filePath = extractFilePath(argSummary);
    if (!filePath)
        return null;
    const lastDot = filePath.lastIndexOf(".");
    if (lastDot === -1)
        return null;
    return filePath.slice(lastDot).toLowerCase();
}
export function isCodeFile(argSummary) {
    const ext = extensionFromArgSummary(argSummary);
    return ext !== null && ext in EXT_TO_LANG;
}
export function highlightContent(content, argSummary) {
    const ext = extensionFromArgSummary(argSummary);
    if (!ext || !(ext in EXT_TO_LANG)) {
        return [{ kind: "plain", value: content }];
    }
    return tokenize(content, EXT_TO_LANG[ext]);
}
export function colorForKind(kind, palette) {
    switch (kind) {
        case "keyword":
            return palette.text.accent;
        case "string":
            return palette.status.success;
        case "number":
            return palette.text.link;
        case "comment":
            return palette.ui.comment;
        case "type":
            return palette.status.warning;
        case "builtin":
            return palette.text.accent;
        case "operator":
            return palette.text.secondary;
        case "attr":
            return palette.status.warning;
        case "tag":
            return palette.text.link;
        case "meta":
            return palette.text.accent;
        case "addition":
            return palette.status.success;
        case "deletion":
            return palette.status.error;
        case "punct":
            return palette.text.primary;
        case "plain":
        default:
            return palette.text.primary;
    }
}
function extractFilePath(argSummary) {
    try {
        const parsed = JSON.parse(argSummary);
        return parsed.filePath || parsed.path || parsed.file || null;
    }
    catch {
        const match = argSummary.match(/[\w./-]+\.[\w]+/);
        return match ? match[0] : null;
    }
}
//# sourceMappingURL=syntax-highlight.js.map