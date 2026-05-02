/**
 * Knowledge base bootstrap.
 *
 * Seeds the local qmd collection from docs/ on first use.
 * Runs fire-and-forget from the primer loader — never blocks startup.
 */

import { join } from "node:path";
import { access, constants } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

// Marker file: once seeded, we skip on subsequent starts.
const SEED_MARKER = join(homedir(), ".dirgha", "kb-seeded");

export async function maybeInitKb(cwd: string): Promise<void> {
  // Skip if already seeded this install.
  try {
    await access(SEED_MARKER, constants.F_OK);
    return;
  } catch { /* not seeded yet */ }

  // Find docs/ relative to cwd, or the package's own docs/.
  const docsDir = join(cwd, "docs");
  let resolvedDocs: string;
  try {
    await access(docsDir, constants.R_OK);
    resolvedDocs = docsDir;
  } catch {
    return; // no docs/ dir — skip silently
  }

  try {
    // Use @tobilu/qmd CLI to add the collection.
    // qmd CLI: qmd collection add <path> --name <name>
    // If qmd CLI is not available, try to use the JS SDK.
    await execFileAsync("qmd", ["collection", "add", resolvedDocs, "--name", "dirgha-docs"], {
      timeout: 30_000,
      env: { ...process.env },
    });
    // Write marker so we don't re-seed on every start.
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(homedir(), ".dirgha"), { recursive: true });
    await writeFile(SEED_MARKER, new Date().toISOString(), "utf8");
  } catch {
    // qmd CLI not available or failed — skip silently.
    // The qmd_search tool's JS SDK path still works without pre-indexing
    // by passing collection=docsDir directly.
  }
}
