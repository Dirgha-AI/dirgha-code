/**
 * Dropdown shown below the InputBox while the user is typing an
 * `@…` file reference. The list is fuzzy-matched against a cached
 * snapshot of the working tree (walked once on first open).
 *
 * Contract with App/InputBox:
 *   - Parent renders this component when `query !== null`.
 *   - Parent extracts the query token itself (substring after last `@`).
 *   - Parent calls `onPick(path)` to splice the chosen path back into
 *     the input buffer, replacing the `@query` segment.
 *   - Parent calls `onCancel()` on Esc.
 *
 * Matching: a simple subsequence filter — every character of the
 * query must appear in the candidate in order, case-insensitive.
 * Score = negative distance between matched positions, so tight
 * matches float to the top.
 */
import * as React from 'react';
export interface AtFileCompleteProps {
    cwd: string;
    query: string;
    onPick: (path: string) => void;
    onCancel: () => void;
}
export declare function AtFileComplete(props: AtFileCompleteProps): React.JSX.Element;
