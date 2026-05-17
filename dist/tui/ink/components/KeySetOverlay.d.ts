/**
 * Inline API key entry overlay.
 *
 * Shown automatically when a provider throws "X_API_KEY is required".
 * The user types their key, presses Enter → key is saved to
 * ~/.dirgha/keys.json (mode 0600) and the original request is retried.
 */
import * as React from "react";
export interface KeySetOverlayProps {
    /** e.g. "DEEPSEEK_API_KEY" */
    keyName: string;
    /** called with the entered value; parent saves + retries */
    onSave: (value: string) => void;
    onCancel: () => void;
}
declare function KeySetOverlayInner(props: KeySetOverlayProps): React.JSX.Element;
export declare const KeySetOverlay: React.MemoExoticComponent<typeof KeySetOverlayInner>;
export {};
