import * as React from "react";
export declare const SPINNER_FRAMES: readonly ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export interface SpinnerTick {
    busy: boolean;
    /** Shared frame index driven by a single interval, so all spinner
     *  glyphs on screen rotate in lockstep instead of strobing. */
    frame: number;
}
export declare const SpinnerContext: React.Context<SpinnerTick>;
