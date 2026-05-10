/**
 * Approval prompt. Synchronously reads a single-char response from
 * stdin; falls back to a line-based prompt when stdin is not a TTY
 * (e.g., piped invocations).
 */
import { style, defaultTheme } from "./theme.js";
import { createInterface } from "node:readline";
export function createTuiApprovalBus(autoApproveTools = new Set()) {
    return {
        requiresApproval(toolName) {
            return !autoApproveTools.has(toolName);
        },
        async request(req) {
            const banner = style(defaultTheme.warning, `\n⚠ Approve ${req.tool}? (y/n/a=always/d=deny-all) [y]`);
            process.stdout.write(`${banner}\n`);
            process.stdout.write(style(defaultTheme.muted, `  ${req.summary}\n`));
            if (req.diff) {
                const preview = truncate(req.diff, 1200);
                process.stdout.write(`${preview}\n`);
            }
            process.stdout.write("> ");
            const answer = await readOneChar();
            switch (answer.toLowerCase()) {
                case "a":
                    autoApproveTools.add(req.tool);
                    return "approve_once";
                case "d":
                    return "deny_always";
                case "n":
                    return "deny";
                case "y":
                    return "approve_once";
                default:
                    return "approve_once";
            }
        },
    };
}
function readOneChar() {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            const rl = createInterface({
                input: process.stdin,
                output: process.stdout,
            });
            let rlSettled = false;
            // Resolve with empty string if the readline interface closes before a response.
            rl.once("close", () => {
                if (!rlSettled) {
                    rlSettled = true;
                    resolve("");
                }
            });
            rl.once("error", (err) => {
                if (!rlSettled) {
                    rlSettled = true;
                    rl.close();
                    reject(err);
                }
            });
            rl.question("", (ans) => {
                if (!rlSettled) {
                    rlSettled = true;
                    rl.close();
                    resolve(ans.trim());
                }
            });
            return;
        }
        let settled = false;
        const onData = (buf) => {
            if (settled)
                return;
            settled = true;
            // Stop listening for further data events and put stdin back to normal mode.
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.off("data", onData);
            process.stdin.off("error", onError);
            // Drain any bytes that were already buffered (e.g. the rest of "yes\n"
            // after the initial 'y').  read() returns null when the internal buffer
            // is empty.
            while (process.stdin.read() !== null) {
                // discard – drain buffered bytes after the initial keypress.
            }
            resolve(buf.toString("utf8"));
        };
        const onError = (err) => {
            if (settled)
                return;
            settled = true;
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.off("data", onData);
            process.stdin.off("error", onError);
            reject(err);
        };
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.once("data", onData);
        process.stdin.once("error", onError);
    });
}
function truncate(s, max) {
    return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
//# sourceMappingURL=approval.js.map