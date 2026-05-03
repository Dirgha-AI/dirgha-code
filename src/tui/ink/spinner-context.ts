import * as React from "react";

export const SPINNER_FRAMES = [
  "⠋",
  "⠙",
  "⠹",
  "⠸",
  "⠼",
  "⠴",
  "⠦",
  "⠧",
  "⠇",
  "⠏",
] as const;

export interface SpinnerTick {
  busy: boolean;
  /** Shared frame index driven by a single interval, so all spinner
   *  glyphs on screen rotate in lockstep instead of strobing. */
  frame: number;
}

export const SpinnerContext = React.createContext<SpinnerTick>({
  busy: false,
  frame: 0,
});
