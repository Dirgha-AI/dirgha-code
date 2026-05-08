/**
 * Modal overlay for the sandbox-mode toggle.
 *
 * Same interaction grammar as ThemePicker / ModelPicker — arrow keys
 * move the cursor, Enter selects, Esc / `q` cancels, digits 1-3 jump.
 *
 * Each row shows the mode name + a one-line description so the user
 * sees the trade-off (filesystem confinement, network policy) at the
 * point of choosing.
 */
import * as React from "react";
export type SandboxMode = "off" | "auto" | "strict";
export interface SandboxPickerProps {
    current: SandboxMode;
    onPick: (mode: SandboxMode) => void;
    onCancel: () => void;
}
export declare function SandboxPicker(props: SandboxPickerProps): React.JSX.Element;
