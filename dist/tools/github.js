/**
 * GitHub client tool.
 *
 * Wraps the `gh` CLI for common GitHub operations: creating / listing PRs,
 * creating / listing issues, and viewing repo info. Every action returns
 * structured JSON so the model can act on specific fields without parsing
 * plain text.
 *
 * Requires the `gh` CLI to be installed and authenticated. The tool checks
 * for the binary at call time and returns a clear error when it is absent.
 */
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const GH_TIMEOUT_MS = 30_000;
/** Resolve whether `gh` is available; returns path or null. */
async function resolveGh() {
    try {
        const { stdout } = await execFileAsync(process.platform === "win32" ? "where" : "which", ["gh"], { timeout: 3_000 });
        return stdout.trim().split(/\r?\n/)[0] ?? null;
    }
    catch {
        return null;
    }
}
/** Run `gh` with the given args, collect stdout+stderr, return exit code + text. */
async function runGh(args, cwd, env) {
    return new Promise((resolveAll) => {
        const child = spawn("gh", args, {
            cwd,
            env,
            stdio: ["pipe", "pipe", "pipe"],
        });
        const stdoutChunks = [];
        const stderrChunks = [];
        child.stdout.on("data", (buf) => stdoutChunks.push(buf));
        child.stderr.on("data", (buf) => stderrChunks.push(buf));
        const timer = setTimeout(() => {
            child.kill("SIGTERM");
            setTimeout(() => {
                try {
                    child.kill("SIGKILL");
                }
                catch {
                    /* already gone */
                }
            }, 2_000);
        }, GH_TIMEOUT_MS);
        child.on("error", () => {
            clearTimeout(timer);
            resolveAll({ code: -1, stdout: "", stderr: "spawn error" });
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            resolveAll({
                code: code ?? -1,
                stdout: Buffer.concat(stdoutChunks).toString("utf8"),
                stderr: Buffer.concat(stderrChunks).toString("utf8"),
            });
        });
    });
}
/** Build the `gh` args array for each action. */
function buildArgs(input) {
    const lim = String(input.limit ?? 30);
    switch (input.action) {
        case "pr_create": {
            const args = ["pr", "create", "--json", "number,url,title,state,draft"];
            if (input.title)
                args.push("--title", input.title);
            if (input.body)
                args.push("--body", input.body);
            if (input.base)
                args.push("--base", input.base);
            if (input.draft)
                args.push("--draft");
            return args;
        }
        case "pr_list": {
            const args = [
                "pr",
                "list",
                "--limit",
                lim,
                "--json",
                "number,url,title,state,draft,headRefName,author",
            ];
            if (input.state)
                args.push("--state", input.state);
            return args;
        }
        case "pr_view": {
            const args = [
                "pr",
                "view",
                "--json",
                "number,url,title,state,body,draft,headRefName,baseRefName,author,reviews,checks",
            ];
            if (input.state) {
                // pr view doesn't filter by state, but we can pass a number/branch via state
                // treat it as a positional specifier when numeric
                if (/^\d+$/.test(input.state))
                    args.push(input.state);
            }
            return args;
        }
        case "issue_list": {
            const args = [
                "issue",
                "list",
                "--limit",
                lim,
                "--json",
                "number,url,title,state,labels,assignees,author,createdAt",
            ];
            if (input.state && input.state !== "merged") {
                args.push("--state", input.state);
            }
            if (input.label && input.label.length > 0) {
                args.push("--label", input.label.join(","));
            }
            return args;
        }
        case "issue_create": {
            const args = [
                "issue",
                "create",
                "--json",
                "number,url,title",
            ];
            if (input.title)
                args.push("--title", input.title);
            if (input.body)
                args.push("--body", input.body ?? "");
            if (input.assignee)
                args.push("--assignee", input.assignee);
            if (input.label && input.label.length > 0) {
                for (const l of input.label)
                    args.push("--label", l);
            }
            return args;
        }
        case "repo_view": {
            return [
                "repo",
                "view",
                "--json",
                "name,description,url,defaultBranchRef,isPrivate,stargazerCount,forkCount,languages,licenseInfo,createdAt,pushedAt",
            ];
        }
    }
}
export const githubTool = {
    name: "github",
    description: "Run GitHub operations via gh CLI: create PRs, list issues, view repo info. " +
        "Requires the `gh` CLI to be installed and authenticated (`gh auth login`). " +
        "All responses are structured JSON.",
    inputSchema: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: [
                    "pr_create",
                    "pr_list",
                    "pr_view",
                    "issue_list",
                    "issue_create",
                    "repo_view",
                ],
                description: "The GitHub operation to perform.",
            },
            title: {
                type: "string",
                description: "PR or issue title (required for pr_create / issue_create).",
            },
            body: {
                type: "string",
                description: "PR or issue body text.",
            },
            base: {
                type: "string",
                description: "Target branch for pr_create (defaults to the repo default branch).",
            },
            draft: {
                type: "boolean",
                description: "Create PR as draft (pr_create only).",
            },
            assignee: {
                type: "string",
                description: "GitHub login to assign (issue_create only).",
            },
            label: {
                type: "array",
                items: { type: "string" },
                description: "Labels to apply (issue_create / issue_list filter).",
            },
            state: {
                type: "string",
                enum: ["open", "closed", "merged"],
                description: "Filter state for pr_list / issue_list, or PR number for pr_view.",
            },
            limit: {
                type: "integer",
                minimum: 1,
                maximum: 200,
                description: "Max items to return for list operations (default 30).",
            },
        },
        required: ["action"],
    },
    timeoutMs: 35_000,
    requiresApproval: (raw) => {
        const input = raw;
        // Mutations require approval; reads do not.
        return input.action === "pr_create" || input.action === "issue_create";
    },
    async execute(rawInput, ctx) {
        const input = rawInput;
        const ghBin = await resolveGh();
        if (!ghBin) {
            return {
                content: "gh CLI not found. Install it from https://cli.github.com and run `gh auth login`.",
                isError: true,
            };
        }
        const args = buildArgs(input);
        ctx.onProgress?.(`gh ${args.join(" ")}`);
        const result = await runGh(args, ctx.cwd, ctx.env);
        if (result.code !== 0) {
            const detail = result.stderr.trim() || result.stdout.trim();
            return {
                content: `gh exited with code ${result.code}: ${detail}`,
                data: { action: input.action, exitCode: result.code, data: null },
                isError: true,
            };
        }
        let parsed = null;
        try {
            parsed = JSON.parse(result.stdout);
        }
        catch {
            // Some gh commands don't output JSON even with --json (e.g. interactive
            // prompts fall through). Return raw text in that case.
            parsed = result.stdout.trim();
        }
        return {
            content: typeof parsed === "string"
                ? parsed
                : JSON.stringify(parsed, null, 2),
            data: { action: input.action, exitCode: result.code, data: parsed },
            isError: false,
        };
    },
};
//# sourceMappingURL=github.js.map