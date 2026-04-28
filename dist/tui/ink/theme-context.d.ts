/**
 * React context for sharing the active hex-colour palette with Ink
 * components.  The provider resolves a Palette from the theme name
 * supplied by the caller (usually the application root).
 */
import React from 'react';
import type { Palette, ThemeName } from '../theme.js';
interface ThemeProviderProps {
    activeTheme: ThemeName;
    children: React.ReactNode;
}
export declare function ThemeProvider({ activeTheme, children }: ThemeProviderProps): React.ReactElement;
export declare function useTheme(): Palette;
export {};
