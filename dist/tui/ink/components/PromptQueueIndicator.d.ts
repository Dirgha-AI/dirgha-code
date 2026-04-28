/**
 * Renders the pending prompt queue above the InputBox.
 *
 * While a turn is running the user can keep typing — submissions land
 * in App's `promptQueue` state and get drained FIFO when the active
 * turn finishes. Showing the queue makes that contract visible: the
 * user sees that their messages are *not* lost and *not* interleaved.
 *
 * Compact by design: max 3 lines (older items collapse into "+N more").
 * Renders nothing when the queue is empty.
 */
import * as React from 'react';
interface Props {
    queued: string[];
}
export declare function PromptQueueIndicator(props: Props): React.JSX.Element | null;
export {};
