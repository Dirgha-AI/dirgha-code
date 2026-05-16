/**
 * `dirgha register` — publish a dirgha-agent.yaml manifest to the Dirgha agent registry.
 *
 * Inspired by Fetch.ai uAgents Almanac registration: every agent auto-registers
 * its capability manifest on startup. This CLI command provides the manual / CI
 * equivalent.
 *
 * Usage:
 *   dirgha register                        Read dirgha-agent.yaml from cwd
 *   dirgha register --manifest <path>      Read manifest from custom path
 *   dirgha register --gateway <url>        Override gateway URL
 *   dirgha register --dry-run              Validate + print without POSTing
 *   dirgha register --token <jwt>          Provide auth token directly
 */
import type { Subcommand } from './index.js';
export declare const registerSubcommand: Subcommand;
