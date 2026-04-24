/**
 * Bottom-anchored prompt input.
 *
 * Uses `ink-text-input` for the editable field. Ctrl+C is handled here
 * (two presses within 1.5s exits) rather than relying on Ink's default
 * SIGINT so App can own the exit policy. Enter triggers onSubmit with
 * the trimmed value and clears the buffer.
 */
import * as React from 'react';
export interface InputBoxProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (value: string) => void;
    busy: boolean;
    placeholder?: string;
}
export declare function InputBox(props: InputBoxProps): React.JSX.Element;
