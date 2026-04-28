import { jsx as _jsx } from "react/jsx-runtime";
/**
 * React context for sharing the active hex-colour palette with Ink
 * components.  The provider resolves a Palette from the theme name
 * supplied by the caller (usually the application root).
 */
import { createContext, useContext } from 'react';
import { paletteFor } from '../theme.js';
const ThemeContext = createContext({
    palette: paletteFor('dark'),
});
export function ThemeProvider({ activeTheme, children }) {
    const palette = paletteFor(activeTheme);
    return (_jsx(ThemeContext.Provider, { value: { palette }, children: children }));
}
export function useTheme() {
    const ctx = useContext(ThemeContext);
    return ctx.palette;
}
//# sourceMappingURL=theme-context.js.map