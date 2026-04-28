/**
 * Modal overlay for picking a theme palette.
 *
 * Mirrors ModelPicker's interaction grammar so muscle memory carries
 * across both pickers: arrow keys move the cursor, Enter selects,
 * Esc / `q` cancels, digit keys 1-9 jump to a row.
 *
 * Each row renders three colour swatches drawn from that theme's
 * palette (brand · accent · borderActive) so the user can see what
 * they'll get before they pick.
 */
import * as React from 'react';
import { type ThemeName } from '../../theme.js';
export interface ThemePickerProps {
    current: ThemeName;
    onPick: (id: ThemeName) => void;
    onCancel: () => void;
}
export declare function ThemePicker(props: ThemePickerProps): React.JSX.Element;
