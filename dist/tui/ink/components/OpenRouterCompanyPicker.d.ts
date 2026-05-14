/**
 * Third step in the OpenRouter picker flow:
 *   ProviderPicker → OpenRouterCompanyPicker → ModelPicker (filtered)
 *
 * Lists upstream company prefixes available on OpenRouter so the user
 * can narrow the model list before seeing hundreds of entries.
 *
 * Keys: ↑↓ / k j / ctrl+p ctrl+n  navigate
 *       1-9   jump
 *       enter pick → opens ModelPicker filtered to this company
 *       esc   go back to ProviderPicker
 *       type  fuzzy-filter the company names
 */
import * as React from "react";
export interface CompanyEntry {
    /** Prefix/slug used to filter models, e.g. "anthropic", "deepseek" */
    id: string;
    /** Human-readable label, e.g. "Anthropic" */
    label: string;
    /** How many OR models belong to this company */
    modelCount: number;
    /** Optional short description */
    blurb?: string;
    /** True when the user's current model belongs to this company */
    isCurrent?: boolean;
}
export interface OpenRouterCompanyPickerProps {
    companies: CompanyEntry[];
    onPick: (companyId: string) => void;
    onCancel: () => void;
}
export declare function OpenRouterCompanyPicker(props: OpenRouterCompanyPickerProps): React.JSX.Element;
