/**
 * GPUJobIndicator — Shows running GPU jobs in the TUI.
 *
 * Polls ~/.dirgha/gpu-jobs.json every 5s and displays any running
 * GPU instances with cost tracking.
 */
import * as React from "react";
export declare function GPUJobIndicator(): React.JSX.Element | null;
