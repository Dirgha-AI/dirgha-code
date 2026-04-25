/**
 * `dirgha audit-codebase [--root <dir>] [--out <file>] [--concurrency N] [-m <model>]`
 *
 * Fans an audit prompt across every immediate src module in parallel
 * via the existing fleet primitive. Each sub-agent gets a fresh
 * context, audits ONE module, writes its findings to a partial
 * markdown file. A final synthesis pass concatenates the partials
 * into a single report.
 *
 * Why a one-liner: a single agent with the whole src in working
 * memory hits compaction-loss before it can synthesize. Fleet gives
 * each module its own ~200 KB context budget.
 *
 * Default audit prompt covers: dead code, weak tests, missing
 * coverage, security, contradictions, cross-platform bugs, perf.
 */
import type { Subcommand } from './index.js';
export declare const auditCodebaseSubcommand: Subcommand;
