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
}

export const SpinnerContext = React.createContext<SpinnerTick>({
  busy: false,
});
