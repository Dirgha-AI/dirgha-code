/**
 * Status bar: rendered between turns. Shows model, session, turn count
 * and cumulative cost/tokens.
 */
import type { UsageTotal } from '../kernel/types.js';
export interface StatusBarState {
    model: string;
    sessionId: string;
    turn: number;
    usage: UsageTotal;
}
export declare function renderStatusBar(state: StatusBarState, width?: number): string;
