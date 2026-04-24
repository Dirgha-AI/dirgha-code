/**
 * Status bar rendered below the input box.
 *
 * Left cluster: cwd basename + provider id.
 * Right cluster: model label + cumulative tokens + cost.
 * When busy, a subtle spinner frame appears on the right.
 */
import * as React from 'react';
export interface StatusBarProps {
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    cwd: string;
    busy: boolean;
}
export declare function StatusBar(props: StatusBarProps): React.JSX.Element;
