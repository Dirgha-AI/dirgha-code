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
];
export const SpinnerContext = React.createContext({
    busy: false,
    frame: 0,
});
//# sourceMappingURL=spinner-context.js.map