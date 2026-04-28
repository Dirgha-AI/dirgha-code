/**
 * Two-step model picker — provider card grid → model list.
 *
 * Stage 1 of the new flow (paired with ModelPicker for stage 2).
 * Shows one row per registered provider with:
 *   ●  if any model from this provider is the currently-selected one
 *   ⓘ  with a model-count badge
 *   short blurb (kimi/deepseek/qwen/...)
 *   key-status indicator (✓ key set, ⚠ key missing)
 *
 * Mirrors opencode's DialogProvider → DialogModel chain, so users
 * with 50+ models in catalogue don't drown in one giant list.
 *
 * Keys:
 *   ↑↓ / k j / ctrl+p ctrl+n  navigate
 *   1-9   jump
 *   enter pick → opens ModelPicker filtered to this provider
 *   esc   cancel
 *   /     start typing to fuzzy-filter the provider names
 */
import * as React from 'react';
export interface ProviderEntry {
    id: string;
    label: string;
    modelCount: number;
    /** True when the API key for this provider is configured. */
    hasKey: boolean;
    /** Short human description shown after the label. */
    blurb?: string;
    /** True when the user's current model belongs to this provider. */
    isCurrent?: boolean;
}
export interface ProviderPickerProps {
    providers: ProviderEntry[];
    onPick: (providerId: string) => void;
    onCancel: () => void;
}
export declare function ProviderPicker(props: ProviderPickerProps): React.JSX.Element;
