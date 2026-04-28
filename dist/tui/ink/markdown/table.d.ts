/**
 * Pipe-syntax markdown table renderer.
 *
 * Computes column widths from header + rows, pads cells with the
 * specified alignment, and draws light unicode separators. Cells
 * pass through `RenderInline` so bold/italic/code/links inside cells
 * render correctly.
 */
import * as React from 'react';
import type { Palette } from '../../theme.js';
interface TableProps {
    headers: string[];
    rows: string[][];
    align: Array<'left' | 'right' | 'center' | null>;
    palette: Palette;
    /** Total available width for the table. Cells get scaled down if needed. */
    maxWidth: number;
}
export declare function TableRenderer(props: TableProps): React.ReactElement;
export {};
