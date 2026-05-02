/**
 * Project primer loader.
 *
 * At boot, walk up from cwd looking for DIRGHA.md (or CLAUDE.md as a
 * compat fallback). The first one found becomes the project primer
 * stitched into the system prompt. Capped at PRIMER_CAP_BYTES so an
 * accidentally-huge file doesn't blow the model's context.
 *
 * The loader is intentionally synchronous-ish (one stat per parent
 * dir, capped at a small depth). Callers wire its output into
 * `applyMode(systemPrompt, mode)` so the boot context is:
 *
 *   ┌─ mode preamble (PLAN / ACT / VERIFY)
 *   ├─ project primer (DIRGHA.md, capped)
 *   └─ caller-supplied --system text (rare)
 */

import { readFileSync, statSync } from "node:fs";
import { join, parse, resolve } from "node:path";
import { maybeInitKb } from "./kb-init.js";

const PRIMER_FILES = ["DIRGHA.md", "CLAUDE.md"];
const PRIMER_CAP_BYTES = 8_000;
const MAX_PARENT_WALK = 6;

export interface PrimerResult {
  primer: string;
  source: string | null;
  truncated: boolean;
}

/**
 * Walk up from `startDir` looking for a primer file. Returns the
 * first match, capped to PRIMER_CAP_BYTES. Returns an empty primer
 * with source=null when nothing is found.
 */
export function loadProjectPrimer(startDir: string): PrimerResult {
  let dir = resolve(startDir);
  for (let i = 0; i < MAX_PARENT_WALK; i++) {
    for (const name of PRIMER_FILES) {
      const path = join(dir, name);
      try {
        const info = statSync(path);
        if (info.isFile()) {
          let content = readFileSync(path, "utf8");
          let truncated = false;
          if (content.length > PRIMER_CAP_BYTES) {
            content =
              content.slice(0, PRIMER_CAP_BYTES) +
              "\n\n[...primer truncated to 8 KB...]";
            truncated = true;
          }
          void maybeInitKb(dir).catch(() => {});
          return { primer: content, source: path, truncated };
        }
      } catch {
        /* not present, keep walking */
      }
    }
    const next = parse(dir).dir;
    if (!next || next === dir) break;
    dir = next;
  }
  return { primer: "", source: null, truncated: false };
}

/**
 * Compose the full boot system prompt. Order:
 *
 *   1. soul          — who dirgha is and how it should behave
 *   2. modePreamble  — act/plan/verify/ask gates
 *   3. project primer — DIRGHA.md / CLAUDE.md
 *   4. ledgerContext — cross-session memory (digest + recent entries)
 *   5. gitState      — workspace snapshot (interactive only)
 *   6. userSystem    — caller-supplied --system flag (escape hatch)
 *
 * Empty sections drop out — no leading/trailing blank lines.
 */
export function composeSystemPrompt(parts: {
  soul?: string;
  modePreamble: string;
  primer?: string;
  ledgerContext?: string;
  gitState?: string;
  userSystem?: string | undefined;
}): string {
  const sections: string[] = [];
  if (parts.soul && parts.soul.trim()) {
    sections.push(parts.soul.trim());
  }
  sections.push(parts.modePreamble.trim());
  if (parts.primer && parts.primer.trim()) {
    sections.push(
      `<project_primer>\n${parts.primer.trim()}\n</project_primer>`,
    );
  }
  if (parts.ledgerContext && parts.ledgerContext.trim()) {
    sections.push(parts.ledgerContext.trim());
  }
  if (parts.gitState && parts.gitState.trim()) {
    sections.push(parts.gitState.trim());
  }
  if (parts.userSystem && parts.userSystem.trim()) {
    sections.push(parts.userSystem.trim());
  }
  return sections.filter((s) => s.length > 0).join("\n\n");
}
