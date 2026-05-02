#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const CHANGELOG = "CHANGELOG.md";

async function main(): Promise<void> {
  const latest = process.argv[2];
  if (!latest) {
    console.error("Usage: node scripts/changelog-bump.mjs <vX.Y.Z>");
    process.exit(1);
  }

  const log = execFileSync("git", ["log", "--oneline", "--no-decorate", `${latest}..HEAD`], { encoding: "utf8" }).trim();
  if (!log) {
    console.log(`No commits between ${latest} and HEAD — nothing to bump.`);
    process.exit(0);
  }

  const entries = log.split("\n").map((line) => {
    const msg = line.replace(/^[a-f0-9]+ /, "");
    const cat = msg.startsWith("fix") ? "Fixed"
      : msg.startsWith("feat") ? "Added"
      : msg.startsWith("test") ? "Tests"
      : msg.startsWith("release") ? "Release"
      : msg.startsWith("docs") ? "Docs"
      : "Changed";
    return `- ${cat}: ${msg}`;
  });

  const date = new Date().toISOString().split("T")[0];
  const header = `\n## [${process.argv[2]}] — ${date}\n\n${entries.join("\n")}\n`;

  let existing = "";
  try { existing = await readFile(CHANGELOG, "utf8"); } catch { /* new file */ }

  const marker = "<!-- CHANGELOG:INSERT -->";
  if (existing.includes(marker)) {
    const updated = existing.replace(marker, `${marker}\n${header}`);
    await writeFile(CHANGELOG, updated, "utf8");
  } else {
    await writeFile(CHANGELOG, `# Changelog\n\n${marker}\n${header}`, "utf8");
  }

  console.log(`CHANGELOG.md updated with ${entries.length} entries for ${latest}.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
