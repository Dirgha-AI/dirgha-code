/**
 * `dirgha node <start|stop|status|invite>` — background daemon that contributes
 * idle compute/bandwidth and earns Dirgha Credits automatically.
 *
 * Inspired by Grass Network's model: install once, run daemon, earn Credits
 * redeemable for premium model access.
 *
 * PID file: ~/.dirgha/node.pid
 * Heartbeat: POST /api/node/heartbeat every 60 seconds.
 * Credits: 1 per heartbeat (= 1/min). 20% referral bonus for 90 days.
 */
import type { Subcommand } from './index.js';
export declare const nodeSubcommand: Subcommand;
