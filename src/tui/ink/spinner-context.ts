import * as React from "react";

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

// Single shared spinner frame index. 0 = not spinning (busy=false).
// Components read this context instead of owning their own setInterval.
export const SpinnerContext = React.createContext<number>(0);
