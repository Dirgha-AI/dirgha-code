/**
 * Inline model-switch prompt.
 *
 * Renders below an error item when the kernel attached a `failoverModel`
 * suggestion. Three single-key answers:
 *   y → swap currentModel to the suggestion, retry the failed turn
 *   n → keep current model, surface the original error
 *   p → open the model picker so the user can pick anything
 *
 * Stays mounted only until a key is pressed; App removes it from state
 * after the choice resolves.
 */
import * as React from 'react';
export interface ModelSwitchPromptProps {
    failedModel: string;
    failoverModel: string;
    onAccept: (failoverModel: string) => void;
    onReject: () => void;
    onPicker: () => void;
}
export declare function ModelSwitchPrompt(props: ModelSwitchPromptProps): React.JSX.Element;
