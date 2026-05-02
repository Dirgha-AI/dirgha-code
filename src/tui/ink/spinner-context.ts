import * as React from "react";

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

// Carries only the busy flag. Components that need a spinner glyph render
// <SpinnerGlyph isActive={busy} /> directly — they no longer read a shared
// frame index that forces the whole tree to re-render at 12.5 Hz.
export const SpinnerContext = React.createContext<{ busy: boolean }>({ busy: false });
