/**
 * Modal overlay for picking a model — opencode-style polish.
 *
 * Presentation: a bordered, centred box with the model catalogue
 * grouped by provider. Arrow keys move the cursor; Enter selects;
 * Esc / `q` cancels. Digit keys 1-9 pick by position within the
 * filtered list. Letters typed when not in command mode build a
 * fuzzy filter; Backspace removes the last char.
 *
 * Visual cues mirror opencode's DialogModel:
 *   ● leading filled disc for the currently-selected model
 *   ▸ leading caret for the cursor row (overrides ●)
 *   right-aligned tier footer (free / basic / pro / premium / price)
 *   bottom keybind hint bar with all shortcuts
 *
 * pinnedFamilies: optional list of provider-name substrings to sort
 * to the top (in order given). Default order: kimi, deepseek, minimax,
 * gemini, qwen, ring, inclusionai, claude, openai.
 */
import * as React from "react";
export interface ModelEntry {
    id: string;
    provider: string;
    tier?: "free" | "basic" | "pro" | "premium";
    label?: string;
}
export interface ModelPickerProps {
    models: ModelEntry[];
    current: string;
    onPick: (id: string) => void;
    onCancel: () => void;
    /** Optional ordered list of provider-name substrings to pin to the top. */
    pinnedFamilies?: string[];
}
export declare function ModelPicker(props: ModelPickerProps): React.JSX.Element;
