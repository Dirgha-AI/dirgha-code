/**
 * Session branching: create a new session whose first message is a
 * summary of the parent, so the child inherits context without dragging
 * the full parent transcript. Branch metadata is logged to both parent
 * and child.
 */
import type { Provider } from "../kernel/types.js";
import type { Session, SessionStore } from "./session.js";
export interface BranchOptions {
    name: string;
    summarizer: Provider;
    summaryModel: string;
}
export interface BranchResult {
    child: Session;
    summary: string;
}
export declare function branchSession(parent: Session, store: SessionStore, opts: BranchOptions): Promise<BranchResult>;
