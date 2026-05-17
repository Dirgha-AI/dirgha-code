import * as React from "react";
export declare const SPINNER_FRAMES: readonly ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export interface SpinnerTick {
    busy: boolean;
}
export declare const SpinnerContext: React.Context<SpinnerTick>;
