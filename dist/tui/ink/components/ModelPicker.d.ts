/**
 * Modal overlay for picking a model.
 *
 * Presentation: a bordered, centred box with the model catalogue
 * grouped by provider. Arrow keys move the cursor, Enter selects,
 * Esc / `q` cancels. Digit keys 1-9 pick by position within the
 * visible list for muscle-memory speed.
 *
 * Shape of the overlay is deliberately small (≤200 LOC); the
 * catalogue itself is owned upstream so this file stays purely
 * presentational.
 */
import * as React from 'react';
export interface ModelEntry {
    id: string;
    provider: string;
    tier?: 'free' | 'basic' | 'pro' | 'premium';
    label?: string;
}
export interface ModelPickerProps {
    models: ModelEntry[];
    current: string;
    onPick: (id: string) => void;
    onCancel: () => void;
}
export declare function ModelPicker(props: ModelPickerProps): React.JSX.Element;
