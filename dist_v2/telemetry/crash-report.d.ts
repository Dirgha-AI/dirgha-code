/**
 * `dirgha doctor --send-crash-report` — explicit, consent-driven
 * crash bundle flow.
 *
 * Design: docs/sprints/2026-04-28-cli-excellence/CRASH-REPORT-DESIGN.md
 *
 * Flow:
 *   1. Build a bundle: version, OS bucket, Node major, last error
 *      (sanitised), audit-log tail (last 5 entries, paths under $HOME
 *      replaced with '~'), env-var NAMES matching /KEY|TOKEN|SECRET/i
 *      (values redacted).
 *   2. Show the preview to the user.
 *   3. Prompt for [y]es / [N]o / [c]opy / [q]uit. Default: No.
 *   4. On 'y': POST to the configured crash-report endpoint, append a
 *      send-record to ~/.dirgha/audit/crash-sends.jsonl.
 *   5. On 'c': copy bundle to clipboard (xclip / pbcopy / wl-copy /
 *      clip.exe — try in order). Zero network involvement.
 *
 * Privacy guarantee: sanitisation happens BEFORE preview. The bytes
 * the user sees are exactly the bytes that will leave the machine.
 * Never sends prompts, model responses, file contents, API key values.
 */
export declare function runCrashReport(opts: {
    argv: string[];
}): Promise<number>;
