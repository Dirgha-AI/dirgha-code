/**
 * String-replace edit with exact matching.
 *
 * When the exact string is missing, returns an error so the agent can
 * retry with more specific anchors. This is deterministic and
 * auditable — no "nearest fuzzy match" guessing.
 */
import { readFile, stat, writeFile } from "node:fs/promises";
import { summariseDiff, unifiedDiff } from "./diff.js";
import { decodeLiteralUnicodeEscapes, isValidCwdPath } from "../utils/fs.js";
export const fsEditTool = {
    name: "fs_edit",
    description: "Replace an exact substring in a file. Fails on ambiguity (multiple matches) unless replaceAll is set. Use larger context around oldString to disambiguate.",
    inputSchema: {
        type: "object",
        properties: {
            path: { type: "string" },
            oldString: { type: "string" },
            newString: { type: "string" },
            replaceAll: { type: "boolean" },
        },
        required: ["path", "oldString", "newString"],
    },
    requiresApproval: () => true,
    async execute(rawInput, ctx) {
        const input = rawInput;
        const check = isValidCwdPath(ctx.cwd, input.path);
        if (!check.valid)
            return { content: check.error, isError: true };
        const abs = check.resolved;
        const info = await stat(abs).catch(() => undefined);
        if (!info || !info.isFile())
            return { content: `No such file: ${input.path}`, isError: true };
        const before = await readFile(abs, "utf8");
        const oldString = decodeLiteralUnicodeEscapes(input.oldString);
        const newString = decodeLiteralUnicodeEscapes(input.newString);
        if (oldString === newString) {
            return {
                content: "oldString and newString are identical; nothing to do.",
                isError: true,
            };
        }
        const exactCount = countOccurrences(before, oldString);
        if (exactCount === 0) {
            return {
                content: `oldString not found in ${input.path}. Provide more surrounding context or verify the file.`,
                isError: true,
            };
        }
        if (exactCount > 1 && !input.replaceAll) {
            return {
                content: `oldString matches ${exactCount} locations. Set replaceAll=true, or include more context to disambiguate.`,
                isError: true,
            };
        }
        const after = input.replaceAll
            ? splitJoin(before, oldString, newString)
            : before.replace(oldString, newString);
        const diff = unifiedDiff(before, after, {
            fromLabel: input.path,
            toLabel: input.path,
        });
        const { added, removed } = summariseDiff(diff);
        await writeFile(abs, after, "utf8");
        const summary = `Edited ${input.path}: ${input.replaceAll ? exactCount : 1} replacement(s) (+${added} / -${removed})`;
        const content = diff ? `${summary}\n\n${diff}` : summary;
        return {
            content,
            data: { replacements: input.replaceAll ? exactCount : 1, added, removed },
            isError: false,
            metadata: {
                diff,
                added,
                removed,
                replacements: input.replaceAll ? exactCount : 1,
            },
        };
    },
};
function countOccurrences(haystack, needle) {
    if (needle.length === 0)
        return 0;
    let count = 0;
    let idx = 0;
    for (;;) {
        const found = haystack.indexOf(needle, idx);
        if (found < 0)
            break;
        count++;
        idx = found + needle.length;
    }
    return count;
}
function splitJoin(haystack, needle, replacement) {
    return haystack.split(needle).join(replacement);
}
//# sourceMappingURL=fs-edit.js.map