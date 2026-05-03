import { jsx as _jsx } from "react/jsx-runtime";
/**
 * React context for sharing the active hex-colour palette with Ink
 * components.  The provider resolves a Palette from the theme name
 * supplied by the caller (usually the application root).
 */
import React, { createContext, useContext } from 'react';
import { paletteFor } from '../theme.js';
const ThemeContext = createContext({
    palette: paletteFor('readable'),
});
export function ThemeProvider({ activeTheme, children }) {
    // Stable object references — avoids re-rendering every useTheme() consumer
    // (including Logo inside <Static>) on each App re-render.
    const palette = React.useMemo(() => paletteFor(activeTheme), [activeTheme]);
    const value = React.useMemo(() => ({ palette }), [palette]);
    return (_jsx(ThemeContext.Provider, { value: value, children: children }));
}
export function useTheme() {
    const ctx = useContext(ThemeContext);
    return ctx.palette;
}
//# sourceMappingURL=theme-context.js.map