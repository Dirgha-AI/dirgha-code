/**
 * `dirgha ledger <add|show|tail|search|digest>` — append-only ledger +
 * digest. The agent's memory across sessions is two files at
 * `~/.dirgha/ledger/<scope>.jsonl` + `<scope>.md`. A fresh agent reads
 * the digest, tails the JSONL, and resumes work where the previous
 * session left off.
 */
import type { Subcommand } from './index.js';
export declare const ledgerSubcommand: Subcommand;
