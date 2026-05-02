/**
 * Approval prompt. Synchronously reads a single-char response from
 * stdin; falls back to a line-based prompt when stdin is not a TTY
 * (e.g., piped invocations).
 */

import type { ApprovalBus } from "../kernel/types.js";
import { style, defaultTheme } from "./theme.js";
import { createInterface } from "node:readline";

export function createTuiApprovalBus(
  autoApproveTools: Set<string> = new Set(),
): ApprovalBus {
  return {
    requiresApproval(toolName: string): boolean {
      return !autoApproveTools.has(toolName);
    },
    async request(req) {
      const banner = style(
        defaultTheme.warning,
        `\n⚠ Approve ${req.tool}? (y/n/a=always/d=deny-all) [y]`,
      );
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
        default:
          return "approve";
      }
    },
  };
}

function readOneChar(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question("", (ans) => {
        rl.close();
        resolve(ans.trim());
      });
      return;
    }
    let settled = false;
    const onData = (buf: Buffer): void => {
      if (settled) return;
      settled = true;
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off("data", onData);
      process.stdin.off("error", onError);
      resolve(buf.toString("utf8"));
    };
    const onError = (err: Error): void => {
      if (settled) return;
      settled = true;
      process.stdin.setRawMode(false);
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

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
